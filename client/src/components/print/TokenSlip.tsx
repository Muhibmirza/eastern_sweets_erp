import dayjs from 'dayjs';
import { EASTERN_SWEETS_LOGO_BASE64 } from '../../constants/logo';
import { formatQuantity } from '../../utils/format';
import { PrintBrandFooter } from './PrintBrandFooter';

const amount = (value = 0) => String(Math.round(Number(value) || 0));

export function TokenSlip({ token }: { token: any }) {
  const items = token.items || [];

  return (
    <div className="thermal-print" style={{ margin: 0, padding: '0 0.25mm', width: '70mm', maxWidth: '70mm', fontFamily: '"Courier New", monospace, Arial, sans-serif', color: '#000', fontWeight: 900, overflow: 'hidden' }}>
      <div style={{ textAlign: 'center', marginBottom: '2px' }}>
        <img src={EASTERN_SWEETS_LOGO_BASE64} alt="Eastern Sweets" style={{ display: 'block', width: '30mm', maxWidth: '30mm', height: 'auto', maxHeight: '32mm', objectFit: 'contain', margin: '0 auto' }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: '20pt', fontWeight: 900, lineHeight: 1 }}>TOKEN {token.tokenNumber}</div>
      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '7.8pt', fontWeight: 900 }}>
        <thead>
          <tr>
            <th style={{ width: '42%', textAlign: 'left', borderBottom: '1px solid #000', padding: '2px 0' }}>ITEM</th>
            <th style={{ width: '26%', textAlign: 'center', borderBottom: '1px solid #000', padding: '2px 0' }}>QTY</th>
            <th style={{ width: '32%', textAlign: 'right', borderBottom: '1px solid #000', padding: '2px 0' }}>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, index: number) => (
            <tr key={`${item.productId || item.name}-${index}`}>
              <td style={{ width: '42%', borderBottom: '1px dashed #777', padding: '2px 0', wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'top' }}>{item.name || item.product?.name || 'Item'}</td>
              <td style={{ width: '26%', borderBottom: '1px dashed #777', padding: '2px 0', textAlign: 'center', wordBreak: 'break-word', verticalAlign: 'top' }}>{formatQuantity(item.displayQuantity || item.quantity, item.displayUnit || item.unit || item.product?.unit || '')}</td>
              <td style={{ width: '32%', borderBottom: '1px dashed #777', padding: '2px 0', textAlign: 'right', verticalAlign: 'top' }}>{amount(item.subtotal || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12pt', fontWeight: 900, padding: '3px 0' }}>
        <span>Total:</span>
        <span>{amount(token.totalAmount || 0)}</span>
      </div>
      <div style={{ borderTop: '1px solid #000', margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10pt', padding: '2px 0' }}>
        <span>{dayjs(token.createdAt).format('DD-MMM-YYYY')}</span>
        <span>{dayjs(token.createdAt).format('hh:mm A')}</span>
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
      <PrintBrandFooter />
    </div>
  );
}
