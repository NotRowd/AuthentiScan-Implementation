function errorHandler(error, req, res, _next) {
  console.error(error);

  if (error.name === 'MulterError') {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'Image must not be larger than 10 MB.'
        : 'Image upload failed.';

    return res.status(400).json({
      success: false,
      message
    });
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'An unexpected server error occurred.'
  });
}

module.exports = errorHandler;
