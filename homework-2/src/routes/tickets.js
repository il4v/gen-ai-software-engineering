const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/ticketController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/', controller.listTickets);
router.post('/', controller.createTicket);
router.get('/:id', controller.getTicket);
router.put('/:id', controller.updateTicket);
router.delete('/:id', controller.deleteTicket);
router.post('/import', upload.single('file'), controller.importTickets);
router.post('/:id/auto-classify', controller.autoClassify);

module.exports = router;
