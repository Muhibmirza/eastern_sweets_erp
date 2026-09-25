import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, PackagePlus, Power } from 'lucide-react';
import { useState } from 'react';
import { api, unwrap } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { useUiStore } from '../../store/ui';
import type { Category, PackagingType } from '../../types';
import { pkr } from '../../utils/format';

const emptyForm = { name: '', chargeType: 'FIXED' as PackagingType['chargeType'], extraCharge: '', categoryIds: [] as string[], isActive: true };

export default function PackagingTypes() {
  const queryClient = useQueryClient();
  const toast = useUiStore((state) => state.toast);
  const [editing, setEditing] = useState<PackagingType | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const packaging = useQuery({ queryKey: ['packaging-types'], queryFn: () => unwrap<PackagingType[]>(api.get('/api/packaging-types')) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => unwrap<Category[]>(api.get('/api/categories')) });

  const save = useMutation({
    mutationFn: () => editing ? unwrap(api.put(`/api/packaging-types/${editing.id}`, { ...form, extraCharge: Number(form.extraCharge) })) : unwrap(api.post('/api/packaging-types', { ...form, extraCharge: Number(form.extraCharge) })),
    onSuccess: () => { toast(editing ? 'Packaging type updated' : 'Packaging type added'); setOpen(false); setEditing(null); setForm(emptyForm); queryClient.invalidateQueries({ queryKey: ['packaging-types'] }); },
    onError: (error: any) => toast(error.response?.data?.message || 'Could not save packaging type', 'error')
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => unwrap(api.delete(`/api/packaging-types/${id}`)),
    onSuccess: () => { toast('Packaging type deactivated'); queryClient.invalidateQueries({ queryKey: ['packaging-types'] }); },
    onError: (error: any) => toast(error.response?.data?.message || 'Could not deactivate packaging type', 'error')
  });

  const beginEdit = (row: PackagingType) => {
    setEditing(row);
    setForm({ name: row.name, chargeType: row.chargeType, extraCharge: String(row.extraCharge), categoryIds: row.categories?.map((item) => item.categoryId) || [], isActive: row.isActive });
    setOpen(true);
  };
  const toggleCategory = (id: string) => setForm((current) => ({ ...current, categoryIds: current.categoryIds.includes(id) ? current.categoryIds.filter((x) => x !== id) : [...current.categoryIds, id] }));

  return <div className="space-y-5">
    <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Packaging Types</h2><p className="text-sm text-slate-500">Assign packaging to product categories and set its POS charge.</p></div><button className="btn-primary inline-flex items-center gap-2" onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }}><PackagePlus size={17} />Add Packaging</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Name</th><th>Charge Type</th><th>Extra Charge</th><th>Categories</th><th>Status</th><th className="text-right">Actions</th></tr></thead><tbody>
        {(packaging.data || []).map((row) => <tr key={row.id} className="border-t dark:border-slate-800"><td className="py-3 font-semibold">{row.name}</td><td>{row.chargeType.replace('_', ' ')}</td><td>{row.chargeType === 'PERCENTAGE' ? `${row.extraCharge}%` : pkr(row.extraCharge)}</td><td>{row.categories?.map((item) => item.category.name).join(', ') || 'None'}</td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{row.isActive ? 'Active' : 'Inactive'}</span></td><td><div className="flex justify-end gap-2"><button className="grid h-9 w-9 place-items-center rounded border text-blue-700" title="Edit" onClick={() => beginEdit(row)}><Edit size={16} /></button>{row.isActive && <button className="grid h-9 w-9 place-items-center rounded border text-red-700" title="Deactivate" onClick={() => deactivate.mutate(row.id)}><Power size={16} /></button>}</div></td></tr>)}
        {!packaging.data?.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No packaging types configured.</td></tr>}
      </tbody></table></div>
    </section>
    <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Edit Packaging Type' : 'Add Packaging Type'} size="md">
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <label className="grid gap-1 text-sm"><span className="font-semibold">Name *</span><input className="erp-input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Gift Box" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm"><span className="font-semibold">Charge Type *</span><select className="erp-input" value={form.chargeType} onChange={(event) => setForm({ ...form, chargeType: event.target.value as PackagingType['chargeType'] })}><option value="FIXED">Fixed</option><option value="PER_KG">Per KG</option><option value="PERCENTAGE">Percentage</option></select></label><label className="grid gap-1 text-sm"><span className="font-semibold">Extra Charge *</span><input className="erp-input" type="number" min="0" step="0.01" required value={form.extraCharge} onChange={(event) => setForm({ ...form, extraCharge: event.target.value })} /></label></div>
        <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Categories</legend><div className="grid max-h-48 grid-cols-2 gap-2 overflow-auto">{categories.data?.filter((category) => category.type !== 'RAW_MATERIAL').map((category) => <label key={category.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.categoryIds.includes(category.id)} onChange={() => toggleCategory(category.id)} />{category.name}</label>)}</div></fieldset>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Active</label>
        <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save'}</button></div>
      </form>
    </Modal>
  </div>;
}
