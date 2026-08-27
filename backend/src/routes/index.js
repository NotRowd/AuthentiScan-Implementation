const express = require('express');
const { checkDatabaseConnection } = require('../config/db');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const scanRoutes = require('./scanRoutes');
const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'online',
      service: 'AuthentiScan API',
      version: '0.1.0'
    }
  });
});

router.get('/database/health', async (req, res, next) => {
  try {
    const database = await checkDatabaseConnection();

    res.status(200).json({
      success: true,
      data: {
        status: 'online',
        ...database
      }
    });
  } catch (error) {
    next(error);
  }
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/scans', scanRoutes);
module.exports = router;
