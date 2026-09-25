export type Role = 'ADMIN' | 'MANAGER' | 'PRODUCTION_MANAGER' | 'CASHIER' | 'STAFF';
export type Unit = 'KG' | 'GRAM' | 'LITRE' | 'ML' | 'PIECE' | 'BOX' | 'DOZEN' | 'PACK';
export type PaymentMethod = 'CASH' | 'CARD' | 'JAZZCASH' | 'EASYPAISA';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: 'SWEET' | 'BAKERY' | 'RAW_MATERIAL' | 'DAIRY' | 'CHOCOLATES' | 'HALWA' | 'DESSERTS' | 'RAMADAN_ITEM';
  description?: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  category?: Category;
  unit: Unit;
  sellingPrice: number;
  costPrice: number;
  currentCost: number;
  currentStock: number;
  minStockLevel: number;
  imageUrl?: string;
  isActive: boolean;
  description?: string;
  saleMode: 'WEIGHT' | 'UNIT';
  quantityPresets?: number[] | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  city?: string;
  email?: string;
  creditLimit?: number;
  outstandingBalance?: number;
  notes?: string;
  totalOrders: number;
}

export interface SaleItem {
  id?: string;
  productId: string;
  product?: Product;
  quantity: number;
  displayQuantity?: number;
  displayUnit?: Unit;
  unitPrice: number;
  subtotal: number;
  costPrice?: number;
  profit?: number;
  packagingTypeId?: string | null;
  packagingCharge?: number;
  packagingType?: PackagingType | null;
}

export interface PackagingType {
  id: string;
  name: string;
  extraCharge: number;
  chargeType: 'FIXED' | 'PER_KG' | 'PERCENTAGE';
  isActive: boolean;
  categories?: Array<{ categoryId: string; category: Category }>;
}

export interface Sale {
  id: string;
  invoiceNo: string;
  customer?: Customer;
  items: SaleItem[];
  totalAmount: number;
  discount: number;
  taxAmount: number;
  netAmount: number;
  paymentMethod: PaymentMethod;
  cashReceived?: number | null;
  changeGiven?: number | null;
  isDelivery?: boolean;
  deliveryCharges?: number;
  tokenNumber?: number | null;
  cashier?: { name: string; email?: string };
  createdAt: string;
}

export interface Token {
  id: string;
  tokenNumber: number;
  items: SaleItem[];
  totalAmount: number;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  cashier?: { name: string };
  createdAt: string;
  completedAt?: string;
  saleId?: string;
}

export interface Order {
  id: string;
  customer?: Customer;
  type: 'WALKIN' | 'ADVANCE' | 'DELIVERY';
  status: OrderStatus;
  totalAmount: number;
  advancePaid: number;
  dueAmount: number;
  deliveryDate?: string;
  notes?: string;
  createdAt: string;
  items?: SaleItem[];
}

export interface RawMaterial {
  id: string;
  name: string;
  unit: Unit;
  currentStock: number;
  minStockLevel: number;
  costPerUnit: number;
  avgCost?: number;
  isActive?: boolean;
  isLow?: boolean;
  supplier?: Supplier;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address?: string;
  city?: string;
  balance: number;
}

export interface Employee {
  id: string;
  name: string;
  fatherName?: string;
  phone: string;
  cnic?: string;
  role: string;
  designation?: string;
  address?: string;
  department?: string;
  salaryType?: 'DAILY' | 'MONTHLY';
  dailyWage?: number;
  basicSalary: number;
  joiningDate: string;
  leavingDate?: string;
  isActive: boolean;
  status?: 'ACTIVE' | 'LEFT' | 'SUSPENDED';
}
