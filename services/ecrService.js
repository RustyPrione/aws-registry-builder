const { 
  ECRClient, 
  CreateRepositoryCommand, 
  DescribeRepositoriesCommand, 
  DescribeImagesCommand 
} = require("@aws-sdk/client-ecr");

const { awsConfig } = require('../config/aws');

const client = new ECRClient(awsConfig);

// add this policy AmazonEC2ContainerRegistryFullAccess

// 🔥 Create repository
async function createRepo(repoName) {
  const command = new CreateRepositoryCommand({
    repositoryName: repoName
  });

  const res = await client.send(command);

  return {
    name: res.repository.repositoryName,
    uri: res.repository.repositoryUri,
    createdAt: res.repository.createdAt
  };
}

// 🔥 List repositories
async function listRepositories() {
  let nextToken;
  let repos = [];

  do {
    const command = new DescribeRepositoriesCommand({
      nextToken
    });

    const res = await client.send(command);

    repos.push(...res.repositories);
    nextToken = res.nextToken;

  } while (nextToken);

  return repos.map(repo => ({
    name: repo.repositoryName,
    uri: repo.repositoryUri,
    createdAt: repo.createdAt
  }));
}

// 🔥 List images
async function listImages(repoName) {
  const command = new DescribeImagesCommand({
    repositoryName: repoName
  });

  const res = await client.send(command);

  return res.imageDetails.map(img => ({
    tags: img.imageTags,
    digest: img.imageDigest,
    pushedAt: img.imagePushedAt,
    size: img.imageSizeInBytes
  }));
}

async function describeImageByTag(repositoryName, imageTag) {
  const command = new DescribeImagesCommand({
    repositoryName,
    imageIds: [{ imageTag: String(imageTag) }],
  });

  const res = await client.send(command);
  const img = res.imageDetails?.[0];
  if (!img) return null;

  return {
    tags: img.imageTags,
    digest: img.imageDigest,
    pushedAt: img.imagePushedAt,
    sizeBytes: img.imageSizeInBytes,
  };
}

module.exports = {
  createRepo,
  listRepositories,
  listImages,
  describeImageByTag,
};