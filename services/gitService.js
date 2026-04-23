const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { gitConfig } = require("../config/git");

const TEMP_DIR = path.join(__dirname, "../repos");

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(stderr || error.message);
            } else {
                resolve(stdout);
            }
        });
    });
}

function normalizeBitbucketUrl(repoUrl){

  // remove username if present
  repoUrl = repoUrl.replace(
    /https:\/\/.*@bitbucket\.org/,
    "https://bitbucket.org"
  )

  // remove everything after repo name (like /src/main)
  const match = repoUrl.match(/https:\/\/bitbucket\.org\/([^\/]+\/[^\/]+)/)

  if(!match){
    throw new Error("Invalid Bitbucket URL")
  }

  let cleanUrl = `https://bitbucket.org/${match[1]}`

  // ensure .git suffix
  if(!cleanUrl.endsWith(".git")){
    cleanUrl += ".git"
  }

  return cleanUrl
}

function addAuthToRepoUrl(cleanUrl){

  return cleanUrl.replace(
    "https://",
    `https://${gitConfig.BITBUCKET_USER}:${gitConfig.BITBUCKET_TOKEN}@`
  )

}

/**
 * Build/clone URL policy:
 * - If URL already ends with `.git`, use the body URL as-is (may include user@ for Bitbucket).
 * - Otherwise normalize Bitbucket URL and inject app credentials (same as getBranches).
 */
function resolveCloneUrlForBuild(repoUrl) {
  const trimmed = String(repoUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Repository URL is required");
  }

  if (trimmed.endsWith(".git")) {
    return trimmed;
  }

  const cleanUrl = normalizeBitbucketUrl(trimmed);
  const authUrl = addAuthToRepoUrl(cleanUrl);
  // console.log("Final URL:", authUrl);
  return authUrl;
}

async function getBranches(repoUrl) {
  try {

    const cleanUrl = normalizeBitbucketUrl(repoUrl)

    const authUrl = addAuthToRepoUrl(cleanUrl)

    // console.log("Final URL:", authUrl)

    const repoName = authUrl.split("/").pop().replace(".git", "");
    const repoPath = path.join(TEMP_DIR, repoName);
    const gitFolder = path.join(repoPath, ".git");

    // If repo folder exists but .git is missing → delete it
    if (fs.existsSync(repoPath) && !fs.existsSync(gitFolder)) {
      console.log("Corrupted repo found. Removing...");
      fs.rmSync(repoPath, { recursive: true, force: true });
    }

    // Clone repo if needed
    if (!fs.existsSync(repoPath)) {
      console.log("Cloning repository...");
      await runCommand(`git clone ${authUrl} ${repoPath}`);
    }

    // Fetch latest
    await runCommand(`git -C ${repoPath} fetch --all`);

    // List remote branches
    const output = await runCommand(`git -C ${repoPath} branch -r`);

    const branches = output
      .split("\n")
      .map(b => b.trim())
      .filter(b => b && !b.includes("HEAD"))
      .map(b => b.replace("origin/", ""));

    return branches;

  } catch (error) {

    console.error("Branch fetch error:", error);

    throw new Error(
      `Failed to fetch branches from repo: ${repoUrl} and error: ${error}`
    );

  }
}
module.exports = {
  getBranches,
  resolveCloneUrlForBuild,
};