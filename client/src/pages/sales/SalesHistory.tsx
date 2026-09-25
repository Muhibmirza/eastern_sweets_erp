import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Printer, Search } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { api, unwrap } from '../../api/client';
import { POSReceipt } from '../../components/print/POSReceipt';
import { Modal } from '../../components/ui/Modal';
import type { Product, Sale } from '../../types';
import { formatQuantity, pkr } from '../../utils/format';
import { silentPrint } from '../../utils/print';

interface SalesItemRow {
  id: string;
  recordType?: 'SALE' | 'ORDER';
  saleId: string;
  invoiceNo: string;
  createdAt: string;
  tokenNumber?: number | null;
  orderType: string;
  customer: string;
  product: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export default function SalesHistory() {
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    productId: '',
    customerSearch: '',
    orderType: '',
    invoiceNo: '',
    tokenNumber: ''
  });
  const [selected, setSelected] = useState<SalesItemRow | null>(null);
  const params = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString(), [filters]);
  const products = useQuery({ queryKey: ['products'], queryFn: () => unwrap<Product[]>(api.get('/api/products?limit=500&isActive=true')) });
  const invoiceSuggestions = useQuery({
    queryKey: ['invoice-suggestions', filters.invoiceNo],
    queryFn: () => unwrap<any[]>(api.get('/api/sales/invoices', { params: { search: filters.invoiceNo } })),
    enabled: filters.invoiceNo.length > 0
  });
  const sales = useQuery({
    queryKey: ['sales-items', params],
    queryFn: async () => {
      const response = await api.get(`/api/sales/items?${params}&limit=500`);
      return { rows: response.data.data as SalesItemRow[], meta: response.data.meta as any };
    }
  });
  const filteredSummary = useMemo(() => {
    const rows = sales.data?.rows || [];
    return {
      totalSales: rows.length,
      totalRevenue: rows.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
      totalQty: rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    };
  }, [sales.data?.rows]);
  const detail = useQuery({
    queryKey: ['ledger-detail', selected?.recordType, selected?.saleId],
    queryFn: () => selected?.recordType === 'ORDER'
      ? unwrap<any>(api.get(`/api/orders/${selected.saleId}`))
      : unwrap<Sale>(api.get(`/api/sales/${selected!.saleId}`)),
    enabled: Boolean(selected?.saleId)
  });
  const printSale = async (row: SalesItemRow) => {
    if (row.recordType === 'ORDER') {
      setSelected(row);
      return;
    }
    const sale = await unwrap<Sale>(api.get(`/api/sales/${row.saleId}`));
    silentPrint(renderToStaticMarkup(<POSReceipt sale={sale} />));
  };

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="grid gap-1 text-sm"><span>Start Date</span><input className="erp-input" type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>End Date</span><input className="erp-input" type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>Product</span><select className="erp-input" value={filters.productId} onChange={(e) => setFilters({ ...filters, productId: e.target.value })}><option value="">All Products</option>{products.data?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span>Order Type</span><select className="erp-input" value={filters.orderType} onChange={(e) => setFilters({ ...filters, orderType: e.target.value })}><option value="">All</option><option value="WALKIN">Walk-in</option><option value="ADVANCE">Advance</option><option value="DELIVERY">Delivery</option></select></label>
          <label className="grid flex-1 gap-1 text-sm"><span>Customer</span><input className="erp-input" placeholder="Search customer..." value={filters.customerSearch} onChange={(e) => setFilters({ ...filters, customerSearch: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">
            <span>Token No</span>
            <input className="erp-input w-36" type="number" placeholder="Token..." value={filters.tokenNumber} onChange={(e) => setFilters({ ...filters, tokenNumber: e.target.value })} />
          </label>
          <label className="relative grid flex-1 gap-1 text-sm">
            <span>Invoice No</span>
            <div className="flex items-center gap-2 rounded-xl border border-[#dac197] bg-white px-3"><Search size={16} /><input className="h-11 flex-1 bg-transparent outline-none" placeholder="ES-..." value={filters.invoiceNo} onChange={(e) => setFilters({ ...filters, invoiceNo: e.target.value })} /></div>
            {invoiceSuggestions.data?.length ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-[#dac197] bg-white shadow-xl">
                {invoiceSuggestions.data.map((invoice) => (
                  <button key={invoice.id} type="button" className="block w-full border-b border-[#ead8bb] px-3 py-2 text-left hover:bg-[#fff4df]" onClick={() => {
                    setFilters({ ...filters, invoiceNo: invoice.invoiceNo });
                    setSelected({
                      id: invoice.id,
                      recordType: 'SALE',
                      saleId: invoice.id,
                      invoiceNo: invoice.invoiceNo,
                      createdAt: invoice.createdAt,
                      tokenNumber: invoice.tokenNumber,
                      orderType: 'Walk-in',
                      customer: invoice.customer,
                      product: invoice.items,
                      unit: '',
                      quantity: 0,
                      unitPrice: 0,
                      subtotal: invoice.total
                    });
                  }}>
                    <div className="font-bold text-[#0f615d]">{invoice.invoiceNo}</div>
                    <div className="text-xs text-[#55716d]">{dayjs(invoice.createdAt).format('DD-MMM-YYYY hh:mm A')} - {invoice.customer} - {pkr(invoice.total)}</div>
                    <div className="truncate text-xs text-[#7b8f8b]">{invoice.items}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[#ead8bb] bg-white/70 p-3"><div className="text-xs uppercase text-[#55716d]">Total Sales</div><div className="text-xl font-bold">{filteredSummary.totalSales}</div></div>
          <div className="rounded-xl border border-[#ead8bb] bg-white/70 p-3"><div className="text-xs uppercase text-[#55716d]">Net Revenue</div><div className="text-xl font-bold">{pkr(filteredSummary.totalRevenue)}</div></div>
          <div className="rounded-xl border border-[#ead8bb] bg-white/70 p-3"><div className="text-xs uppercase text-[#55716d]">Total Returns</div><div className="text-xl font-bold text-red-700">{pkr(sales.data?.meta?.returnAmount || 0)}</div></div>
          <div className="rounded-xl border border-[#ead8bb] bg-white/70 p-3"><div className="text-xs uppercase text-[#55716d]">Final Revenue</div><div className="text-xl font-bold text-[#0f615d]">{pkr(filteredSummary.totalRevenue - Number(sales.data?.meta?.returnAmount || 0))}</div></div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 font-semibold">Sales Ledger</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[#f6f0e7] text-left text-xs uppercase tracking-[0.12em] text-[#55716d]">
              <tr><th className="px-3 py-3">Invoice No</th><th>Token</th><th>Date & Time</th><th>Order Type</th><th>Customer</th><th>Product</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Total</th><th>Print</th></tr>
            </thead>
            <tbody>
              {sales.isLoading && <tr><td colSpan={11} className="px-3 py-8 text-center text-[#55716d]">Loading sales...</td></tr>}
              {sales.data?.rows.map((row) => (
                <tr key={row.id} className="border-t border-[#ead8bb] odd:bg-[#fffaf0]/60 hover:bg-[#f7ead5]">
                  <td className="px-3 py-3"><button className="inline-flex items-center gap-2 font-bold text-[#0f615d]" onClick={() => setSelected(row)}><Eye size={14} />{row.invoiceNo}</button></td>
                  <td>{row.tokenNumber ? `T-${row.tokenNumber}` : '-'}</td>
                  <td>{dayjs(row.createdAt).format('DD-MMM-YYYY hh:mm A')}</td>
                  <td><span className="rounded-full bg-[#e8f4f1] px-2 py-1 text-xs font-bold text-[#0f615d]">{row.orderType}</span></td>
                  <td>{row.customer}</td>
                  <td className="font-semibold">{row.product}</td>
                  <td>{formatQuantity(row.quantity, row.unit)}</td>
                  <td>{row.unit}</td>
                  <td className="font-bold">{pkr(row.unitPrice)}</td>
                  <td className="font-bold">{pkr(row.subtotal)}</td>
                  <td><button className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-700" title="Print" onClick={() => printSale(row)}><Printer size={15} /></button></td>
                </tr>
              ))}
              {!sales.isLoading && !sales.data?.rows.length && <tr><td colSpan={11} className="px-3 py-10 text-center text-[#55716d]">No sales found</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title={`${selected?.recordType === 'ORDER' ? 'Order' : 'Sale'} ${detail.data?.invoiceNo || selected?.invoiceNo || ''}`} size="lg">
        {detail.isLoading && <div className="py-6 text-center text-sm text-[#55716d]">Loading invoice...</div>}
        {detail.data && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 rounded-xl bg-[#fff4df] p-3 md:grid-cols-3">
              <div><b>Date:</b> {dayjs(detail.data.createdAt || detail.data.updatedAt).format('DD-MMM-YYYY hh:mm A')}</div>
              <div><b>Customer:</b> {detail.data.customer?.name || 'Walk-in Customer'}</div>
              <div><b>Total:</b> {pkr(detail.data.netAmount || detail.data.totalAmount || 0)}</div>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th>Product</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
              <tbody>{detail.data.items.map((item: any) => <tr key={item.id} className="border-t border-[#ead8bb]"><td className="py-2">{item.product?.name}</td><td>{formatQuantity(item.displayQuantity || item.quantity, item.displayUnit || item.product?.unit || '')}</td><td>{pkr(item.unitPrice)}</td><td>{pkr(item.subtotal)}</td></tr>)}</tbody>
            </table>
            {selected?.recordType !== 'ORDER' && (
              <div className="flex justify-end">
                <button className="btn-primary" onClick={() => silentPrint(renderToStaticMarkup(<POSReceipt sale={detail.data as Sale} />))}><Printer size={16} /> Print Receipt</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
