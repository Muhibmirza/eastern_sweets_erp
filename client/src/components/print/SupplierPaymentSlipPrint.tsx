import dayjs from 'dayjs';
import { EASTERN_SWEETS_LOGO_BASE64 } from '../../constants/logo';
import { PrintBrandFooter } from './PrintBrandFooter';

const money = (value: number) => Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });

export function SupplierPaymentSlipPrint({ summary, payment }: { summary: any; payment?: any }) {
  const purchases = summary?.purchases || [];
  const supplier = summary?.supplier || {};
  const shortTerm = Number(payment?.shortTermDeduction ?? summary?.shortTermDeduction ?? 0);
  const longTerm = Number(payment?.longTermDeduction ?? summary?.longTermDeduction ?? 0);
  const totalDeductions = shortTerm + longTerm;
  const actualPayment = Number(payment?.amount ?? summary?.actualPayment ?? 0);
  const shortTermRemaining = Number(payment?.shortTermRemainingBalance ?? summary?.shortTermRemainingBalance ?? 0);
  const longTermRemaining = Number(payment?.longTermRemainingBalance ?? summary?.longTermRemainingBalance ?? 0);

  return (
    <div className="thermal-print">
      <div className="print-center">
        <img src={EASTERN_SWEETS_LOGO_BASE64} alt="Eastern Sweets" />
        <div style={{ fontSize: '12pt', fontWeight: 900 }}>SUPPLIER PAYMENT SLIP</div>
      </div>
      <div className="print-line" />
      <div className="print-row"><span>Supplier</span><b>{supplier.name || '-'}</b></div>
      <div className="print-row"><span>Date</span><b>{dayjs().format('DD-MMM-YYYY hh:mm A')}</b></div>
      <div className="print-line" />
      <b>RAW MATERIALS RECEIVED</b>
      <table>
        <thead><tr><th>Material</th><th>Qty</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>
          {purchases.flatMap((purchase: any) => (purchase.items || []).map((item: any) => (
            <tr key={`${purchase.id}-${item.id}`}>
              <td>{item.rawMaterial?.name || 'Item'}</td>
              <td>{item.quantity} {item.rawMaterial?.unit || ''}</td>
              <td style={{ textAlign: 'right' }}>{money(item.subtotal)}</td>
            </tr>
          )))}
          {!purchases.length && <tr><td colSpan={3}>No received purchases in this period.</td></tr>}
        </tbody>
      </table>
      <div className="print-line" />
      <div className="print-row"><span>Total Purchases</span><b>{money(summary?.totalPurchases || 0)}</b></div>
      <div className="print-line" />
      <b>DEDUCTIONS</b>
      <div className="print-row"><span>Short Term Advance</span><b>- {money(shortTerm)}</b></div>
      <div className="print-row"><span>Long Term Advance</span><b>- {money(longTerm)}</b></div>
      <div className="print-row"><span>Total Deductions</span><b>{money(totalDeductions)}</b></div>
      <div className="print-row"><span>Short Term Remaining</span><b>{money(shortTermRemaining)}</b></div>
      <div className="print-row"><span>Long Term Remaining</span><b>{money(longTermRemaining)}</b></div>
      <div className="print-total print-row"><span>ACTUAL PAYMENT</span><b>{money(actualPayment)}</b></div>
      <div className="print-row"><span>Payment Method</span><b>{payment?.paymentMethod || '-'}</b></div>
      <div className="print-line" />
      <div className="print-center">Thank You</div>
      <div className="print-line" />
      <PrintBrandFooter />
    </div>
  );
}
