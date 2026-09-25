import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, PlusCircle, Search, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { api, unwrap } from '../api/client';
import { TableSkeleton } from '../components/Skeleton';
import { useUiStore } from '../store/ui';
import type { Category, Product, RawMaterial } from '../types';
import { dateTime, pkr } from '../utils/format';
import RawMaterials from './inventory/RawMaterials';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { canEditDelete } from '../utils/permissions';
import { ALL_UNITS } from '../constants/units';

const datetimeLocalNow = () => new Date().toISOString().slice(0, 16);
const WEIGHT_PRESETS = [250, 500, 750, 1000, 1500, 2000];
const presetLabel = (grams: number) => grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`;

export default function Inventory() {
  const queryClient = useQueryClient();
  const toast = useUiStore((s) => s.toast);
  const user = useAuthStore((state) => state.user);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockForm, setStockForm] = useState({ quantity: '', reason: 'Manual stock addition', batchNumber: '', expiryDate: '', costPrice: '', date: datetimeLocalNow(), adjustmentType: 'IN' as 'IN' | 'OUT' });
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { register, handleSubmit, reset, watch } = useForm({ defaultValues: { name: '', categoryId: '', unit: 'PIECE', sellingPrice: '', currentStock: '', minStockLevel: '', saleMode: 'UNIT' } });
  const [createPresets, setCreatePresets] = useState<number[]>([250, 500, 750, 1000]);
  const createSaleMode = watch('saleMode');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const products = useQuery({
    queryKey: ['products', debouncedSearch],
    queryFn: () => unwrap<Product[]>(api.get('/api/products', { params: { limit: 200, isActive: true, search: debouncedSearch || undefined } }))
  });
  const raw = useQuery({ queryKey: ['raw-materials'], queryFn: () => unwrap<RawMaterial[]>(api.get('/api/raw-materials')) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => unwrap<Category[]>(api.get('/api/categories')) });
  const movements = useQuery({ queryKey: ['stock-movements'], queryFn: () => unwrap<any[]>(api.get('/api/stock/movements?limit=50')) });

  const createProduct = useMutation({
    mutationFn: (data: any) => unwrap<Product>(api.post('/api/products', data)),
    onSuccess: () => {
      toast('Product saved');
      reset();
      setCreatePresets([250, 500, 750, 1000]);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => toast('Could not save product', 'error')
  });
  const updateProduct = useMutation({
    mutationFn: (data: any) => unwrap<Product>(api.put(`/api/products/${editingProduct!.id}`, data)),
    onSuccess: () => {
      toast('Product updated');
      setEditingProduct(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => toast('Could not update product', 'error')
  });
  const removeProduct = useMutation({
    mutationFn: (id: string) => unwrap(api.delete(`/api/products/${id}`)),
    onSuccess: () => {
      toast('Product deleted');
      setDeleteProduct(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => toast('Could not delete product', 'error')
  });
  const addStock = useMutation({
    mutationFn: () => unwrap<Product>(api.post(`/api/products/${stockProduct!.id}/add-stock`, stockForm)),
    onSuccess: () => {
      toast(stockForm.adjustmentType === 'IN' ? 'Stock added' : 'Stock removed');
      setStockProduct(null);
      setStockForm({ quantity: '', reason: 'Manual stock addition', batchNumber: '', expiryDate: '', costPrice: '', date: datetimeLocalNow(), adjustmentType: 'IN' });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Could not add stock', 'error')
  });

  return (
    <div className="space-y-6">
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold">Products</h2>
          <div className="flex min-h-11 items-center gap-2 rounded-md border px-3 dark:border-slate-700">
            <Search size={18} />
            <input className="bg-transparent outline-none" placeholder="Search products..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
        {products.isLoading ? <TableSkeleton /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-2">Item</th><th>Category</th><th>Price</th><th>Cost</th><th>Stock</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {products.data?.map((product) => (
                  <tr key={product.id} className="border-t dark:border-slate-800">
                    <td className="py-3 font-medium">{product.name}</td>
                    <td>{product.category?.name}</td>
                    <td>{pkr(product.sellingPrice)}</td>
                    <td>{product.currentCost > 0 ? pkr(product.currentCost) : '—'}</td>
                    <td>{product.currentStock} {product.unit}</td>
                    <td><span className={`rounded-md px-2 py-1 text-xs ${product.currentStock <= product.minStockLevel ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{product.currentStock <= product.minStockLevel ? 'Low' : 'OK'}</span></td>
                    <td><div className="flex justify-end gap-2">{(user?.role === 'ADMIN' || user?.role === 'PRODUCTION_MANAGER') && <button className="grid h-8 w-8 place-items-center rounded-md border border-emerald-200 text-emerald-700" title="Adjust Stock" onClick={() => { setStockForm({ quantity: '', reason: 'Manual stock addition', batchNumber: '', expiryDate: '', costPrice: '', date: datetimeLocalNow(), adjustmentType: 'IN' }); setStockProduct(product); }}><PlusCircle size={15} /></button>}{canEditDelete(user?.role) && <><button className="grid h-8 w-8 place-items-center rounded-md border border-blue-200 text-blue-700" title="Edit" onClick={() => setEditingProduct(product)}><Edit size={15} /></button><button className="grid h-8 w-8 place-items-center rounded-md border border-red-200 text-red-700" title="Delete" onClick={() => setDeleteProduct(product)}><Trash2 size={15} /></button></>}</div></td>
                  </tr>
                ))}
                {!products.data?.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">No products found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <form onSubmit={handleSubmit((data) => createProduct.mutate({ ...data, quantityPresets: createSaleMode === 'WEIGHT' ? createPresets : [] }))} className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 font-semibold">Add Product</h2>
        <div className="grid gap-3">
          <input className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" placeholder="Product name" {...register('name', { required: true })} />
          <select className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" {...register('categoryId', { required: true })}>
            <option value="">Category</option>
            {categories.data?.filter((c) => c.type !== 'RAW_MATERIAL').map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          <select className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" {...register('unit')}>{ALL_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select>
          <fieldset className="rounded-md border p-3 dark:border-slate-700">
            <legend className="px-1 text-sm font-semibold">Sale Mode</legend>
            <div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" value="WEIGHT" {...register('saleMode')} />By Weight (kg/g)</label><label className="flex items-center gap-2"><input type="radio" value="UNIT" {...register('saleMode')} />By Piece/Unit</label></div>
          </fieldset>
          {createSaleMode === 'WEIGHT' && <fieldset className="rounded-md border p-3 dark:border-slate-700"><legend className="px-1 text-sm font-semibold">Quantity Presets</legend><div className="grid grid-cols-3 gap-2 text-sm">{WEIGHT_PRESETS.map((grams) => <label key={grams} className="flex items-center gap-2"><input type="checkbox" checked={createPresets.includes(grams)} onChange={() => setCreatePresets((current) => current.includes(grams) ? current.filter((x) => x !== grams) : [...current, grams].sort((a, b) => a - b))} />{presetLabel(grams)}</label>)}</div></fieldset>}
          <input className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" type="number" step="0.001" min="0" placeholder="Selling price" {...register('sellingPrice', { required: true })} />
          <input className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" type="number" step="0.001" min="0" placeholder="Opening stock" {...register('currentStock')} />
          <input className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" type="number" step="0.001" min="0" placeholder="Minimum stock level" {...register('minStockLevel')} />
          <button className="touch rounded-md bg-orange-600 font-semibold text-white">Save Product</button>
        </div>
      </form>
    </div>
      <RawMaterials />
      <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 font-semibold">Recent Stock Movement History</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-2">Date & Time</th><th>Item</th><th>Type</th><th>Qty</th><th>Reason</th><th>User</th></tr></thead>
            <tbody>
              {(movements.data || []).map((movement) => (
                <tr key={movement.id} className="border-t dark:border-slate-800">
                  <td className="py-3">{dateTime(movement.createdAt)}</td>
                  <td>{movement.product?.name || movement.rawMaterial?.name || '-'}</td>
                  <td>{movement.type}</td>
                  <td>{movement.quantity} {movement.product?.unit || movement.rawMaterial?.unit || ''}</td>
                  <td>{movement.reason || '-'}</td>
                  <td>{movement.user?.name || '-'}</td>
                </tr>
              ))}
              {!movements.data?.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No stock movements yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <Modal isOpen={Boolean(editingProduct)} onClose={() => setEditingProduct(null)} title={`Edit ${editingProduct?.name || 'Product'}`} size="lg">
        {editingProduct && <ProductEditForm product={editingProduct} categories={categories.data || []} onCancel={() => setEditingProduct(null)} onSave={(data) => updateProduct.mutate(data)} isSaving={updateProduct.isPending} />}
      </Modal>
      <Modal isOpen={Boolean(stockProduct)} onClose={() => setStockProduct(null)} title={`Adjust Stock: ${stockProduct?.name || 'Product'}`} size="md">
        {stockProduct && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#fff4df] p-3 text-sm">
              <div>Current Stock: <b>{stockProduct.currentStock} {stockProduct.unit}</b></div>
              <div>New Stock will be: <b>{stockProduct.currentStock} {stockForm.adjustmentType === 'IN' ? '+' : '-'} {Number(stockForm.quantity || 0)} = {stockForm.adjustmentType === 'IN' ? stockProduct.currentStock + Number(stockForm.quantity || 0) : stockProduct.currentStock - Number(stockForm.quantity || 0)} {stockProduct.unit}</b></div>
            </div>
            <div>
              <span className="text-sm font-semibold">Adjustment Type *</span>
              <div className="mt-1.5 flex gap-3">
                <label className="flex cursor-pointer items-center gap-1.5"><input type="radio" name="adjType" value="IN" checked={stockForm.adjustmentType === 'IN'} onChange={() => setStockForm({ ...stockForm, adjustmentType: 'IN', reason: stockForm.reason === 'Manual stock removal' ? 'Manual stock addition' : stockForm.reason })} /><span className="font-semibold text-green-600">+ Add Stock</span></label>
                <label className="flex cursor-pointer items-center gap-1.5"><input type="radio" name="adjType" value="OUT" checked={stockForm.adjustmentType === 'OUT'} onChange={() => setStockForm({ ...stockForm, adjustmentType: 'OUT', reason: stockForm.reason === 'Manual stock addition' ? 'Manual stock removal' : stockForm.reason })} /><span className="font-semibold text-red-600">- Remove Stock</span></label>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm"><span>Quantity *</span><input className="erp-input" type="number" min="0" step="0.001" placeholder="0.000" value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: event.target.value })} /></label>
              <label className="grid gap-1 text-sm"><span>Unit</span><select className="erp-input" value={stockProduct.unit} disabled>{ALL_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
              <label className="grid gap-1 text-sm md:col-span-2"><span>Reason</span><input className="erp-input" placeholder="Production complete" value={stockForm.reason} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })} /></label>
              <label className="grid gap-1 text-sm"><span>Batch Number</span><input className="erp-input" placeholder="Optional" value={stockForm.batchNumber} onChange={(event) => setStockForm({ ...stockForm, batchNumber: event.target.value })} /></label>
              <label className="grid gap-1 text-sm"><span>Expiry Date</span><input className="erp-input" type="date" value={stockForm.expiryDate} onChange={(event) => setStockForm({ ...stockForm, expiryDate: event.target.value })} /></label>
              <label className="grid gap-1 text-sm md:col-span-2"><span>Date & Time <small className="text-slate-500">(defaults to now)</small></span><input className="erp-input" type="datetime-local" value={stockForm.date} onChange={(event) => setStockForm({ ...stockForm, date: event.target.value })} /></label>
              <label className="grid gap-1 text-sm md:col-span-2"><span>Cost Price (per unit)</span><input className="erp-input" type="number" min="0" step="0.001" placeholder={stockProduct.currentCost ? String(stockProduct.currentCost) : 'Optional'} value={stockForm.costPrice} onChange={(event) => setStockForm({ ...stockForm, costPrice: event.target.value })} /></label>
            </div>
            {stockForm.adjustmentType === 'OUT' && Number(stockForm.quantity || 0) > stockProduct.currentStock && <p className="text-sm font-semibold text-red-600">Cannot remove more than current stock ({stockProduct.currentStock} {stockProduct.unit})</p>}
            <div className="flex justify-end gap-3"><button className="btn-secondary" type="button" onClick={() => setStockProduct(null)}>Cancel</button><button className="btn-primary" type="button" disabled={addStock.isPending || Number(stockForm.quantity || 0) <= 0 || (stockForm.adjustmentType === 'OUT' && Number(stockForm.quantity || 0) > stockProduct.currentStock)} onClick={() => addStock.mutate()}>{addStock.isPending ? 'Saving...' : 'Adjust Stock'}</button></div>
          </div>
        )}
      </Modal>
      <ConfirmModal isOpen={Boolean(deleteProduct)} onClose={() => setDeleteProduct(null)} onConfirm={() => deleteProduct && removeProduct.mutate(deleteProduct.id)} title={`Delete ${deleteProduct?.name || 'Product'}?`} isLoading={removeProduct.isPending} />
    </div>
  );
}

function ProductEditForm({ product, categories, onCancel, onSave, isSaving }: { product: Product; categories: Category[]; onCancel: () => void; onSave: (data: any) => void; isSaving: boolean }) {
  const [presets, setPresets] = useState<number[]>(product.quantityPresets || [250, 500, 750, 1000]);
  const { register, handleSubmit, watch } = useForm({
    values: {
      name: product.name,
      categoryId: product.categoryId,
      unit: product.unit,
      sellingPrice: product.sellingPrice,
      minStockLevel: product.minStockLevel,
      currentCost: product.currentCost || product.costPrice || 0,
      description: product.description || '',
      isActive: product.isActive
      ,saleMode: product.saleMode || 'UNIT'
    }
  });
  const saleMode = watch('saleMode');
  return (
    <form className="grid gap-4" onSubmit={handleSubmit((data) => onSave({ ...data, quantityPresets: saleMode === 'WEIGHT' ? presets : [] }))}>
      <label><span className="mb-1 block text-sm font-semibold">Name *</span><input className="erp-input" {...register('name', { required: true })} /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label><span className="mb-1 block text-sm font-semibold">Category *</span><select className="erp-input" {...register('categoryId', { required: true })}>{categories.filter((c) => c.type !== 'RAW_MATERIAL').map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-semibold">Unit</span><select className="erp-input" {...register('unit')}>{ALL_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-semibold">Selling Price</span><input className="erp-input" type="number" {...register('sellingPrice', { valueAsNumber: true })} /></label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Cost Price Per Unit (PKR)</span>
          <input className="erp-input" type="number" step="0.001" placeholder="0.00" {...register('currentCost', { valueAsNumber: true })} />
          <span className="mt-1 block text-xs text-slate-500">This is auto-set from production, but can be manually overridden.</span>
        </label>
        <label><span className="mb-1 block text-sm font-semibold">Min Stock</span><input className="erp-input" type="number" {...register('minStockLevel', { valueAsNumber: true })} /></label>
      </div>
      <fieldset className="rounded-md border p-3 dark:border-slate-700"><legend className="px-1 text-sm font-semibold">Sale Mode</legend><div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" value="WEIGHT" {...register('saleMode')} />By Weight (kg/g)</label><label className="flex items-center gap-2"><input type="radio" value="UNIT" {...register('saleMode')} />By Piece/Unit</label></div></fieldset>
      {saleMode === 'WEIGHT' && <fieldset className="rounded-md border p-3 dark:border-slate-700"><legend className="px-1 text-sm font-semibold">Quantity Presets</legend><div className="grid grid-cols-3 gap-2 text-sm">{WEIGHT_PRESETS.map((grams) => <label key={grams} className="flex items-center gap-2"><input type="checkbox" checked={presets.includes(grams)} onChange={() => setPresets((current) => current.includes(grams) ? current.filter((x) => x !== grams) : [...current, grams].sort((a, b) => a - b))} />{presetLabel(grams)}</label>)}</div></fieldset>}
      <label><span className="mb-1 block text-sm font-semibold">Description</span><textarea className="erp-input" {...register('description')} /></label>
      <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button><button className="btn-primary" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button></div>
    </form>
  );
}
