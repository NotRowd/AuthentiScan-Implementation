const express = require('express');
const {
  uploadScan,
  listScans,
  getScan,
  getScanImage
} = require('../controllers/scanController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.post('/', requireAuth, upload.single('image'), uploadScan);
router.get('/', requireAuth, listScans);
router.get('/:scanId', requireAuth, getScan);
router.get('/:scanId/image', requireAuth, getScanImage);

module.exports = router;
