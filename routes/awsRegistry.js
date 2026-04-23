const express = require('express');
const router = express.Router();

const ecr = require('../services/ecrService');
const build = require('../services/codeBuildService');
const logService = require('../services/logService');


/**
 * @swagger
 * /api/aws/repos:
 *   get:
 *     summary: List all ECR repositories
 *     tags:
 *       - AWS ECR
 *     responses:
 *       200:
 *         description: List of repositories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: registry-app
 *                   uri:
 *                     type: string
 *                     example: 123456789012.dkr.ecr.ap-south-1.amazonaws.com/registry-app
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                     example: 2026-03-26T10:00:00Z
 *       500:
 *         description: Server error
 */

router.get('/repos', async (req, res) => {
  try {
    const repos = await ecr.listRepositories();
    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * @swagger
 * /api/aws/create-repo:
 *   post:
 *     summary: Create ECR repository
 *     tags:
 *       - AWS ECR
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repo
 *             properties:
 *               repo:
 *                 type: string
 *                 description: Name of the ECR repository
 *                 example: registry-app
 *     responses:
 *       200:
 *         description: Repository created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 repository:
 *                   type: object
 *                   properties:
 *                     repositoryName:
 *                       type: string
 *                       example: registry-app
 *                     repositoryUri:
 *                       type: string
 *                       example: 123456789012.dkr.ecr.ap-south-1.amazonaws.com/registry-app
 *                     registryId:
 *                       type: string
 *                       example: 123456789012
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/create-repo', async (req, res) => {
  try {
    const { repo } = req.body;
    const result = await ecr.createRepo(repo);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/aws/images/{repo}:
 *   get:
 *     summary: List images in an ECR repository
 *     tags:
 *       - AWS ECR
 *     parameters:
 *       - in: path
 *         name: repo
 *         required: true
 *         description: Name of the ECR repository
 *         schema:
 *           type: string
 *           example: registry-app
 *     responses:
 *       200:
 *         description: List of images
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageDetails:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       imageTags:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["latest", "v1"]
 *                       imageDigest:
 *                         type: string
 *                         example: sha256:abc123...
 *                       imageSizeInBytes:
 *                         type: number
 *                         example: 12345678
 *                       imagePushedAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2026-03-26T10:00:00Z
 *       400:
 *         description: Invalid repository name
 *       500:
 *         description: Server error
 */
router.get('/images/:repo/describe', async (req, res) => {
  try {
    const tag = req.query.tag;
    if (!tag || !String(tag).trim()) {
      return res.status(400).json({ error: "Query parameter tag is required" });
    }
    const result = await ecr.describeImageByTag(req.params.repo, String(tag).trim());
    if (!result) {
      return res.status(404).json({ error: "Image not found for this repository and tag" });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/images/:repo', async (req, res) => {
  try {
    const result = await ecr.listImages(req.params.repo);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/aws/build:
 *   post:
 *     summary: Build and push Docker image to AWS ECR
 *     tags:
 *       - AWS Build
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repo
 *               - tag
 *               - gitUrl
 *               - branch
 *             properties:
 *               repo:
 *                 type: string
 *                 example: infra-dev
 *               tag:
 *                 type: string
 *                 example: v1
 *               gitUrl:
 *                 type: string
 *                 example: https://bitbucket.org/your-repo.git
 *               branch:
 *                 type: string
 *                 example: main
 *     responses:
 *       200:
 *         description: Build triggered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 buildId:
 *                   type: string
 *                   example: registry-build:abcd1234-5678
 *                 status:
 *                   type: string
 *                   example: IN_PROGRESS
 *                 image:
 *                   type: string
 *                   example: 831047846688.dkr.ecr.ap-south-1.amazonaws.com/infra-dev:v1
 *                 logGroupName:
 *                   type: string
 *                   description: CloudWatch log group name for the build
 *                   example: /aws/codebuild/phtn-ai-registry-builder
 *                 logStreamName:
 *                   type: string
 *                   description: CloudWatch log stream name for the build
 *                   example: 28233ce5-4d2d-4e3d-a028-921c5cfa59b1
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/build', async (req, res) => {
  try {
    const { repo, image, tag, gitUrl, branch } = req.body;

    // 🔍 Validation
    if (!repo || !tag || !gitUrl || !branch) {
      return res.status(400).json({
        error: "repo, tag, gitUrl, branch are required"
      });
    }

    // 🔥 Trigger build
    const result = await build.triggerBuild({
      repo,
      tag,
      gitUrl,
      branch
    });

    res.json({
      buildId: result.buildId,
      status: result.status,
      image: result.image
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/aws/build/{id}:
 *   get:
 *     summary: Get AWS CodeBuild status
 *     tags:
 *       - AWS Build
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: infra-test-app:abcd1234
 *     responses:
 *       200:
 *         description: Build status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: SUCCEEDED
 *                 logsUrl:
 *                   type: string
 *                   example: https://console.aws.amazon.com/codebuild/...
 *                 startTime:
 *                   type: string
 *                   format: date-time
 *                 endTime:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Server error
 */
router.get('/build/:id', async (req, res) => {
  try {
    const result = await build.getBuildStatus(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/aws/build/{id}/logs:
 *   get:
 *     summary: Get real-time logs from AWS CodeBuild (CloudWatch)
 *     tags:
 *       - AWS Build
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: CodeBuild build ID
 *         schema:
 *           type: string
 *           example: infra-test-app:abcd1234
 *     responses:
 *       200:
 *         description: Build logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "[Container] Entering phase BUILD"
 *                     - "Cloning repo..."
 *                     - "Building Docker image..."
 *                     - "Pushing image..."
 *                 nextToken:
 *                   type: string
 *                   description: Token for fetching next batch of logs (for streaming)
 *                   example: f/1234567890
 *       400:
 *         description: Invalid build ID
 *       500:
 *         description: Server error
 */

router.get('/build/:id/logs', async (req, res) => {
  try {
    const buildRes = await build.getBuildStatus(req.params.id);
    if (!buildRes.logGroupName || !buildRes.logStreamName) {
      return res.json({ messages: [] });
    }
    const messages = await logService.getBuildLogs(
      buildRes.logGroupName,
      buildRes.logStreamName
    );
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;