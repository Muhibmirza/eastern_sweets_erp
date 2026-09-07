import { validateWriteNumbers } from '../middleware/security.middleware';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getProducts, getProduct, getProductByBarcode, createProduct, updateProduct, deleteProduct, getLowStockProducts, addProductStock } from '../controllers/product.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads/';
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => cb(null, `product-${require('crypto').randomUUID()}${({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' } as Record<string, string>)[file.mimetype]}`)
});
const upload = multer({ storage, fileFilter: (_req, file, cb) => { if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(Object.assign(new Error('File type not allowed'), { status: 400 })); cb(null, true); }, limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

router.get('/', getProducts);
router.get('/low-stock', getLowStockProducts);
router.get('/barcode/:barcode', getProductByBarcode);
router.get('/:id', getProduct);
router.post('/', authorize('ADMIN', 'PRODUCTION_MANAGER'), upload.single('image'), validateWriteNumbers, createProduct);
router.post('/:id/add-stock', authorize('ADMIN', 'PRODUCTION_MANAGER'), addProductStock);
router.put('/:id', authorize('ADMIN'), upload.single('image'), validateWriteNumbers, updateProduct);
router.delete('/:id', authorize('ADMIN'), deleteProduct);

export default router;
