import express from 'express';

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Renzo API is running' });
});

export default router;
