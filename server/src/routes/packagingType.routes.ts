import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createPackagingType, deactivatePackagingType, listPackagingTypes, packagingForCategory, updatePackagingType } from '../controllers/packagingType.controller';

const router = Router();
router.use(authenticate);
router.get('/', listPackagingTypes);
router.get('/for-category/:id', packagingForCategory);
router.post('/', authorize('ADMIN', 'MANAGER'), createPackagingType);
router.put('/:id', authorize('ADMIN', 'MANAGER'), updatePackagingType);
router.delete('/:id', authorize('ADMIN', 'MANAGER'), deactivatePackagingType);
export default router;
