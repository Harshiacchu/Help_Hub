// server/routes/apiKeys.js - API key management
// Mounted in index.js behind requireAuth + requireRole('superior').
//
// POST   /                 { name }  -> full key returned ONCE
// GET    /                 active keys (prefix only, never the full key)
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
    const name = cleanText(req.body.name, "API key name", { min: 1, max: 60 });
    const apiKeyModel = new ApiKeyModel(getDB());

    if (
      (await apiKeyModel.countActive(req.tenantId)) >=
      ApiKeyModel.MAX_KEYS_PER_TENANT
    ) {
      throw new ValidationError(
        `You can have at most ${ApiKeyModel.MAX_KEYS_PER_TENANT} active API keys. Revoke one first.`,
        409
      );
    }
    if (await apiKeyModel.activeNameExists(req.tenantId, name)) {
      throw new ValidationError(
        "An active API key with this name already exists",
        409
      );
    }

    const { key, record } = await apiKeyModel.create(
      req.tenantId,
      name,
      req.user.id
    );
    res.status(201).json({
      success: true,
      data: { ...record, key },
      message: "Copy this key now - it will not be shown again.",
    });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const keys = await new ApiKeyModel(getDB()).listActive(req.tenantId);
    res.json({ success: true, data: keys });
  })
);

router.delete(
  "/:keyId",
  asyncHandler(async (req, res) => {
    const revoked = await new ApiKeyModel(getDB()).revoke(
      req.tenantId,
      req.params.keyId
    );
    if (!revoked)
      return res.status(404).json({
        success: false,
        error: "API key not found or already revoked",
      });
    res.json({ success: true, message: "API key revoked" });
  })
);

router.post(
  "/:keyId/rotate",
  asyncHandler(async (req, res) => {
    const result = await new ApiKeyModel(getDB()).rotate(
      req.tenantId,
      req.params.keyId,
      req.user.id
    );
    if (!result)
      return res.status(404).json({
        success: false,
        error: "API key not found or already revoked",
      });
    res.json({
      success: true,
      data: {
        ...result.record,
        key: result.key,
        rotatedFrom: result.rotatedFrom,
      },
      message:
        "Old key revoked. Copy the new key now - it will not be shown again.",
    });
  })
);

export default router;
