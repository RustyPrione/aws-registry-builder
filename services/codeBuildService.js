const { StartBuildCommand, CodeBuildClient, BatchGetBuildsCommand } = require("@aws-sdk/client-codebuild");
const { awsAccountID, awsConfig } = require("../config/aws");
const { resolveCloneUrlForBuild } = require("./gitService");

// add AWSCodeBuildDeveloperAccess in IAM Role

const client = new CodeBuildClient(awsConfig);
async function triggerBuild({ repo, tag, gitUrl, branch }) {

  const imageUri = `${awsAccountID}.dkr.ecr.${awsConfig.region}.amazonaws.com/${repo}:${tag}`;
  const cloneUrl = resolveCloneUrlForBuild(gitUrl);
  const command = new StartBuildCommand({
    projectName: "phtn-ai-registry-builder", // generic project

    sourceVersion: branch,

    environmentVariablesOverride: [
      { name: "IMAGE_URI", value: imageUri },
      { name: "REPO", value: repo }
    ],

    buildspecOverride: `
version: 0.2

env:
  variables:
    IMAGE_URI: ${awsAccountID}.dkr.ecr.${awsConfig.region}.amazonaws.com/${repo}:${tag}

phases:
  install:
    commands:
      - echo Install phase...

  pre_build:
    commands:
      - echo Logging in to ECR...
      - aws ecr get-login-password --region ${awsConfig.region} | docker login --username AWS --password-stdin ${awsAccountID}.dkr.ecr.${awsConfig.region}.amazonaws.com

  build:
    commands:
      - echo Cloning repo...
      - git clone -b ${branch} ${cloneUrl} .
      - echo Building image...
      - docker build -t $IMAGE_URI .

  post_build:
    commands:
      - echo Pushing image...
      - docker push $IMAGE_URI
`
  });

  const res = await client.send(command);

  return {
    buildId: res.build.id,
    status: res.build.buildStatus,
    image: imageUri
  };
}


async function getBuildStatus(buildId) {
  const command = new BatchGetBuildsCommand({
    ids: [buildId]
  });

  const res = await client.send(command);

  const build = res.builds[0];

//   console.log("FULL BUILD:", JSON.stringify(build, null, 2));

  const toIso = (d) => (d ? new Date(d).toISOString() : null);

  return {
    id: build.id,
    status: build.buildStatus,
    logsUrl: build.logs?.deepLink,
    logGroupName: build.logs?.groupName,
    logStreamName: build.logs?.streamName,
    startTime: toIso(build.startTime),
    endTime: toIso(build.endTime),
  };
}

module.exports = { triggerBuild, getBuildStatus };
