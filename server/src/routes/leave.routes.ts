import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  approveLeaveRequest,
  createLeaveRequest,
  getEmployeeLeaveRequests,
  getLeaveBalance,
  getLeaveRequest,
  getLeaveRequests,
  rejectLeaveRequest
} from '../controllers/leave.controller';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/employee/:employeeId', getEmployeeLeaveRequests);
router.get('/balance/:employeeId', getLeaveBalance);
router.get('/', getLeaveRequests);
router.get('/:id', getLeaveRequest);
router.post('/', createLeaveRequest);
router.patch('/:id/approve', authorize('ADMIN'), approveLeaveRequest);
router.patch('/:id/reject', authorize('ADMIN'), rejectLeaveRequest);

export default router;
