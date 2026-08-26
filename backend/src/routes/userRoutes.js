const express = require('express');
const { getStats } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/stats', requireAuth, getStats);

module.exports = router;