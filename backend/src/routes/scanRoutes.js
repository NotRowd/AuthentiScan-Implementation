const express = require('express');
const { uploadScan } = require('../controllers/scanController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.post('/', requireAuth, upload.single('image'), uploadScan);

module.exports = router;
