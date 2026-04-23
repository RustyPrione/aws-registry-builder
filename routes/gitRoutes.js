const express = require("express");
const router = express.Router();
const { getBranches } = require("../services/gitService");

/**
 * @swagger
 * /api/git/branches:
 *   post:
 *     summary: Clone repository and list branches
 *     description: Takes a Bitbucket repo URL, clones it and returns branch list
 *     tags:
 *       - Git
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               repoUrl:
 *                 type: string
 *                 example: https://bitbucket.org/org/project.git
 *     responses:
 *       200:
 *         description: List of branches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 branches:
 *                   type: array
 *                   items:
 *                     type: string
 */

router.post("/branches", async (req, res) => {
  try {
    const { repoUrl } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: "Repository URL is required" });
    }

    const branches = await getBranches(repoUrl);

    res.json({
      success: true,
      branches
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;