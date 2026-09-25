import dayjs from 'dayjs';
import { Fragment } from 'react';
import type { Sale } from '../../types';
import { EASTERN_SWEETS_LOGO_BASE64 } from '../../constants/logo';
import { formatQuantity } from '../../utils/format';
import { PrintBrandFooter } from './PrintBrandFooter';

interface POSReceiptProps {
  sale: Sale;
  settings?: { shopName?: string; address?: string; phone?: string };
}

const line = <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }} />;
const amount = (value = 0) => String(Math.round(Number(value) || 0));

export function POSReceipt({ sale }: POSReceiptProps) {
  const paid = sale.cashReceived ?? sale.netAmount;

  return (
    <div style={{ margin: 0, padding: '0 0.25mm', paddingTop: 0, marginTop: 0, width: '70mm', maxWidth: '70mm', fontFamily: '"Courier New", monospace, Arial, sans-serif', fontSize: '8.4pt', color: '#000', fontWeight: 900, overflow: 'hidden' }} className="thermal-print">
      <div style={{ textAlign: 'center', margin: 0, padding: 0 }}>
        <img src={EASTERN_SWEETS_LOGO_BASE64} alt="Eastern Sweets" style={{ display: 'block', width: '34mm', maxWidth: '34mm', height: 'auto', maxHeight: '36mm', objectFit: 'contain', margin: '0 auto' }} />
      </div>
      {line}
      {sale.tokenNumber && (
        <>
          <div style={{ textAlign: 'center', fontSize: '22pt', fontWeight: 900, margin: '3px 0' }}>TOKEN: {sale.tokenNumber}</div>
          {line}
        </>
      )}
      <div style={{ fontSize: '10pt', fontWeight: 900, wordBreak: 'break-word' }}>Invoice: {sale.invoiceNo}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2px', fontSize: '8pt', marginTop: 3 }}>
        <span style={{ flex: '1 1 auto' }}>{dayjs(sale.createdAt).format('DD-MMM-YYYY')}</span>
        <span style={{ flex: '0 0 auto', textAlign: 'right' }}>{dayjs(sale.createdAt).format('hh:mm A')}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt', marginTop: 3 }}>
        <span>Cashier:</span>
        <b>{sale.cashier?.name || '-'}</b>
      </div>
      {line}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '7.6pt', fontWeight: 900 }}>
        <thead>
          <tr>
            <th style={{ width: '36%', textAlign: 'left', borderBottom: '1px solid #000', padding: '1px 0' }}>ITEM</th>
            <th style={{ width: '17%', textAlign: 'center', borderBottom: '1px solid #000', padding: '1px 0' }}>QTY</th>
            <th style={{ width: '21%', textAlign: 'right', borderBottom: '1px solid #000', padding: '1px 0' }}>RATE</th>
            <th style={{ width: '26%', textAlign: 'right', borderBottom: '1px solid #000', padding: '1px 0' }}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <Fragment key={`${sale.id}-${item.id || item.productId}`}>
            <tr>
              <td style={{ width: '36%', borderBottom: '1px dashed #777', padding: '1px 0', wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'top' }}>{item.product?.name || 'Item'}</td>
              <td style={{ width: '17%', borderBottom: '1px dashed #777', padding: '1px 0', textAlign: 'center', wordBreak: 'break-word', verticalAlign: 'top' }}>{formatQuantity(item.displayQuantity || item.quantity, item.displayUnit || item.product?.unit || '')}</td>
              <td style={{ width: '21%', borderBottom: '1px dashed #777', padding: '1px 0', textAlign: 'right', verticalAlign: 'top' }}>{amount(item.unitPrice)}</td>
              <td style={{ width: '26%', borderBottom: '1px dashed #777', padding: '1px 0', textAlign: 'right', verticalAlign: 'top' }}>{amount(item.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3} style={{ borderBottom: '1px dashed #777', padding: '1px 0 1px 8px', fontSize: '7pt' }}>{item.packagingType?.name || 'No Packaging'}</td>
              <td style={{ borderBottom: '1px dashed #777', padding: '1px 0', textAlign: 'right', fontSize: '7pt' }}>{amount(item.packagingCharge || 0)}</td>
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      {line}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt' }}><span>Subtotal</span><b>{amount(sale.totalAmount)}</b></div>
      {sale.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt' }}><span>Discount</span><b>- {amount(sale.discount)}</b></div>}
      {sale.isDelivery && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt' }}><span>Delivery</span><b>+ {amount(sale.deliveryCharges || 0)}</b></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '4px 0', margin: '4px 0', fontWeight: 900, fontSize: '11.5pt' }}>
        <span>TOTAL</span><span>{amount(sale.netAmount)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt' }}><span>Payment:</span><b>{sale.paymentMethod}</b></div>
      {sale.paymentMethod === 'CASH' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt' }}><span>Cash Received</span><b>{amount(paid)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt' }}><span>Change</span><b>{amount(sale.changeGiven ?? Math.max(paid - sale.netAmount, 0))}</b></div>
        </>
      )}
      {line}
      <div style={{ textAlign: 'center', fontSize: '12pt', fontWeight: 900, margin: '6px 0' }}>Thank You</div>
      {line}
      <PrintBrandFooter />
    </div>
  );
}
