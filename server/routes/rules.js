// server/routes/rules.js - Company-Specific Rules Configuration
// Priorities, Categories, SLA, Custom Fields
// TODO: Implement with native MongoDB driver

const express = require('express');
const router = express.Router();

// ============================================
// GET ALL RULES FOR TENANT
// ============================================

/**
 * GET /api/v1/rules
 * Get all configuration rules for tenant
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     priorities: { 1: "Critical", 2: "High", 3: "Medium", 4: "Low", 5: "Minimal" },
 *     categories: [ "Bug", "Feature Request", "Account Issue", "Billing", "Other" ],
 *     slaTargets: { critical: 1, high: 2, medium: 4, low: 24, minimal: 48 },
 *     customFields: [ { fieldName, fieldType, required, options } ]
 *   }
 * }
 */
router.get('/', async (req, res) => {
    try {
        const tenantId = req.tenantId;

        // TODO: Query rules collection for this tenant
        // Return priorities, categories, SLA targets, custom fields

        res.json({
            success: true,
            data: {
                priorities: {
                    1: 'Critical',
                    2: 'High',
                    3: 'Medium',
                    4: 'Low',
                    5: 'Minimal'
                },
                categories: [
                    'Bug',
                    'Feature Request',
                    'Account Issue',
                    'Billing',
                    'Performance',
                    'Other'
                ],
                slaTargets: {
                    critical: 1,
                    high: 2,
                    medium: 4,
                    low: 24,
                    minimal: 48
                },
                customFields: [
                    {
                        fieldName: 'department',
                        fieldType: 'select',
                        required: false,
                        options: ['Sales', 'Support', 'Technical', 'Billing']
                    },
                    {
                        fieldName: 'productVersion',
                        fieldType: 'text',
                        required: false,
                        options: null
                    }
                ]
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// UPDATE PRIORITIES
// ============================================

/**
 * PUT /api/v1/rules/priorities
 * Update priority labels for company
 * 
 * Body:
 * {
 *   1: "Critical",
 *   2: "High",
 *   3: "Medium",
 *   4: "Low",
 *   5: "Minimal"
 * }
 */
router.put('/priorities', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const priorities = req.body;

        // TODO: Validate all 5 priority levels exist
        // TODO: Update rules collection with new priority names

        res.json({
            success: true,
            data: {
                priorities: priorities,
                message: 'Priority labels updated'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// UPDATE CATEGORIES
// ============================================

/**
 * PUT /api/v1/rules/categories
 * Update ticket categories for company
 * 
 * Body:
 * {
 *   categories: [ "Bug", "Feature Request", "Account Issue", "Billing", "Other" ]
 * }
 */
router.put('/categories', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { categories } = req.body;

        if (!Array.isArray(categories) || categories.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Categories must be a non-empty array'
            });
        }

        // TODO: Update rules collection with new categories
        // TODO: Validate no duplicate categories

        res.json({
            success: true,
            data: {
                categories: categories,
                message: 'Categories updated'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// UPDATE CUSTOM FIELDS
// ============================================

/**
 * PUT /api/v1/rules/custom-fields
 * Update custom fields for tickets
 * 
 * Body:
 * {
 *   customFields: [
 *     {
 *       fieldName: "department",
 *       fieldType: "select", // "text", "select", "checkbox", "date"
 *       required: false,
 *       options: ["Sales", "Support", "Technical"] // Only for select
 *     }
 *   ]
 * }
 */
router.put('/custom-fields', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { customFields } = req.body;

        // TODO: Validate custom fields structure
        // TODO: Check field types are valid
        // TODO: For select fields, validate options exist
        // TODO: Update rules collection

        res.json({
            success: true,
            data: {
                customFields: customFields,
                message: 'Custom fields updated'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// UPDATE SLA TARGETS
// ============================================

/**
 * PUT /api/v1/rules/sla-targets
 * Update SLA response time targets (in hours)
 * 
 * Body:
 * {
 *   critical: 1,
 *   high: 2,
 *   medium: 4,
 *   low: 24,
 *   minimal: 48
 * }
 */
router.put('/sla-targets', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const slaTargets = req.body;

        // TODO: Validate all 5 priority levels have SLA targets
        // TODO: Validate all values are positive numbers
        // TODO: Update rules collection
        // TODO: Also update tenant document (for quick access)

        res.json({
            success: true,
            data: {
                slaTargets: slaTargets,
                message: 'SLA targets updated'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
