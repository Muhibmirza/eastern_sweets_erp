import dayjs from 'dayjs';
import { EASTERN_SWEETS_LOGO_BASE64 } from '../../constants/logo';
import { PrintBrandFooter } from './PrintBrandFooter';

const money = (value: number) => Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
const qty = (value: number) => Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });

export function ProductSalesReportPrint({ report }: { report: any }) {
  const product = report?.product || {};
  const summary = report?.summary || {};
  return (
    <div style={{
      margin: '0',
      padding: '6px 0',
      width: '80mm',
      maxWidth: '80mm',
      boxSizing: 'border-box',
      overflow: 'hidden',
      wordBreak: 'break-word',
      fontFamily: 'monospace, "Courier New", Arial, sans-serif',
      fontSize: '12pt',
      fontWeight: 'bold',
      color: '#000'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <img src={EASTERN_SWEETS_LOGO_BASE64} alt="Eastern Sweets" style={{ width: '55px', height: '55px', objectFit: 'contain' }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 900, marginBottom: '3px', letterSpacing: '0.5px' }}>PRODUCT SALES REPORT</div>
      <div style={{ textAlign: 'center', fontSize: '11pt', marginBottom: '2px' }}>{product.name || '-'}</div>
      <div style={{ textAlign: 'center', fontSize: '10pt', marginBottom: '6px' }}>
        {dayjs(report.startDate).format('DD-MMM-YYYY')} to {dayjs(report.endDate).format('DD-MMM-YYYY')}
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '4px 0 8px 0' }} />
      <SummaryRow label="Total Transactions:" value={summary.totalTransactions || 0} />
      <SummaryRow label="Total Qty Sold:" value={`${qty(summary.totalQty || 0)} ${product.unit || ''}`} />
      <SummaryRow label="Total Revenue:" value={`Rs. ${money(summary.totalRevenue || 0)}`} />
      <div style={{ borderTop: '1px dashed #000', margin: '6px 0 4px 0' }} />
      <div style={{ textAlign: 'center', fontSize: '9pt', fontWeight: 'normal' }}>
        Printed: {dayjs().format('DD-MMM-YYYY  hh:mm A')}
      </div>
      <PrintBrandFooter />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ marginBottom: '7px', lineHeight: '1.5', fontWeight: 'bold' }}>
      <div style={{ fontSize: '11pt' }}>{label}</div>
      <div style={{ fontSize: '13pt', fontWeight: 900, paddingLeft: '6px' }}>{value}</div>
    </div>
  );
}
