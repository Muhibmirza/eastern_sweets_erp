import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createAdvance, getAdvances, getEmployeeAdvances, recoverAdvance } from '../controllers/advance.controller';
import { deductAdvance } from '../controllers/employee.controller';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/', getAdvances);
router.get('/employee/:employeeId', getEmployeeAdvances);
router.post('/', authorize('ADMIN'), createAdvance);
router.patch('/:id/deduct', authorize('ADMIN'), deductAdvance);
router.patch('/:id/recover', authorize('ADMIN'), recoverAdvance);

export default router;
