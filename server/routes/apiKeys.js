// server/routes/apiKeys.js - API key management
// Mounted in index.js behind requireAuth + requireRole('superior').
//
// POST   /                 { name }  -> the full key is returned once
// GET    /                 active keys (prefix only)
// DELETE /:keyId           revoke
// POST   /:keyId/rotate    revoke + issue a replacement with the same name

import express from "express";
import { getDB } from "../config/db.js";
import { asyncHandler } from "../middleware/auth.js";
import ApiKeyModel from "../models/apiKey.js";
import { ValidationError, cleanText } from "../utils/validators.js";

const router = express.Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = cleanText(req.body.name, "API key name", { max: 60 });
    const apiKeys = new ApiKeyModel(getDB());
    if (
      (await apiKeys.countActive(req.tenantId)) >=
      ApiKeyModel.MAX_KEYS_PER_TENANT
    ) {
      throw new ValidationError(
        `You can have at most ${ApiKeyModel.MAX_KEYS_PER_TENANT} active API keys`,
        409
      );
    }
    const { key, record } = await apiKeys.create(req.tenantId, name);
    res.status(201).json({ success: true, data: { ...record, key } });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await new ApiKeyModel(getDB()).listActive(req.tenantId);
    res.json({ success: true, data });
  })
);

router.delete(
  "/:keyId",
  asyncHandler(async (req, res) => {
    const revoked = await new ApiKeyModel(getDB()).revoke(
      req.tenantId,
      req.params.keyId
    );
    if (!revoked) {
      return res
        .status(404)
        .json({ success: false, error: "API key not found" });
    }
    res.json({ success: true });
  })
);

router.post(
  "/:keyId/rotate",
  asyncHandler(async (req, res) => {
    const result = await new ApiKeyModel(getDB()).rotate(
      req.tenantId,
      req.params.keyId
    );
    if (!result) {
      return res
        .status(404)
        .json({ success: false, error: "API key not found" });
    }
    res.json({ success: true, data: { ...result.record, key: result.key } });
  })
);

export default router;
