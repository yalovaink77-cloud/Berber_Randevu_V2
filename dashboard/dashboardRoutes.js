const express = require('express');
const router = express.Router();
const dashboardStatsService = require('../services/dashboardStatsService');
const { requireBarber, requireTenant } = require('../middleware/auth');

router.use(requireTenant);

router.get('/stats', requireBarber, async (req, res, next) => {
  try {
    const stats = await dashboardStatsService.getDashboardStats(req.businessId);
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
