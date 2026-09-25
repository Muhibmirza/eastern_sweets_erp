import dayjs from 'dayjs';
import { EASTERN_SWEETS_LOGO_BASE64 } from '../../constants/logo';
import { PrintBrandFooter } from './PrintBrandFooter';

const money = (value: number) => Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });

export function SupplierReceiptSlip({ receipt }: { receipt: any }) {
  const supplier = receipt?.supplier || {};
  const materials = receipt?.materials || [];

  return (
    <div className="thermal-print">
      <div className="print-center">
        <img src={EASTERN_SWEETS_LOGO_BASE64} alt="Eastern Sweets" />
        <div style={{ fontSize: '12pt', fontWeight: 900 }}>SUPPLIER RECEIPT</div>
      </div>
      <div className="print-line" />
      <div className="print-row"><span>Supplier</span><b>{supplier.name || '-'}</b></div>
      <div className="print-row"><span>From</span><b>{dayjs(receipt?.startDate).format('DD-MMM-YYYY')}</b></div>
      <div className="print-row"><span>To</span><b>{dayjs(receipt?.endDate).format('DD-MMM-YYYY')}</b></div>
      <div className="print-line" />
      <b>STOCK RECEIVED</b>
      <table>
        <thead><tr><th>Material</th><th>Qty</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>
          {materials.map((material: any) => (
            <tr key={material.id || material.name}>
              <td>{material.name}</td>
              <td>{material.totalQty} {material.unit}</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{money(material.totalAmount)}</td>
            </tr>
          ))}
          {!materials.length && <tr><td colSpan={3}>No stock received in this period.</td></tr>}
        </tbody>
      </table>
      <div className="print-line" />
      <div className="print-row"><span>Total Purchases</span><b>Rs. {money(receipt?.totalPurchaseAmount)}</b></div>
      <div className="print-line" />
      <b>DEDUCTIONS</b>
      <div className="print-row"><span>Short Term Advance</span><b>- Rs. {money(receipt?.shortTermDeduction)}</b></div>
      <div className="print-row"><span>Long Term Monthly</span><b>- Rs. {money(receipt?.longTermDeduction)}</b></div>
      <div className="print-row"><span>Short Term Remaining</span><b>Rs. {money(receipt?.shortTermRemainingBalance)}</b></div>
      <div className="print-row"><span>Long Term Remaining</span><b>Rs. {money(receipt?.longTermRemainingBalance)}</b></div>
      <div className="print-line" />
      <div className="print-total print-row"><span>ACTUAL PAYABLE</span><b>Rs. {money(receipt?.actualPayable)}</b></div>
      <div className="print-line" />
      <PrintBrandFooter />
    </div>
  );
}
