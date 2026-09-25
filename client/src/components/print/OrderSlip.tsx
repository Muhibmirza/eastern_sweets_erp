import dayjs from 'dayjs';
import { EASTERN_SWEETS_LOGO_BASE64 } from '../../constants/logo';
import { formatQuantity, pkr } from '../../utils/format';
import { PrintBrandFooter } from './PrintBrandFooter';

export function OrderSlip({ order }: { order: any }) {
  return (
    <div className="thermal-print">
      <div className="print-center">
        <img src={EASTERN_SWEETS_LOGO_BASE64} alt="Eastern Sweets" style={{ width: 64, height: 64, objectFit: 'contain' }} />
        <div>Eastern Sweets, Bakers &amp; Nimco</div>
        <h2>ORDER SLIP</h2>
      </div>
      <div className="print-line" />
      <div className="print-row"><span>Order No: #{order?.id?.slice(-6)}</span><span>{dayjs(order?.createdAt).format('DD-MMM-YYYY hh:mm A')}</span></div>
      <div>Order Type: {order?.type}</div>
      <div className="print-line" />
      <div>Customer: {order?.customer?.name}</div>
      <div>Phone: {order?.customer?.phone}</div>
      <div>Delivery Date: {order?.deliveryDate ? dayjs(order.deliveryDate).format('DD-MMM-YYYY') : '-'}</div>
      <table><thead><tr><th align="left">ITEM</th><th>QTY</th><th>RATE</th><th align="right">TOTAL</th></tr></thead><tbody>
        {(order?.items || []).map((item: any) => <tr key={item.id || item.productId}><td>{item.product?.name}</td><td align="center">{formatQuantity(item.quantity, item.product?.unit || '')}</td><td align="center">{pkr(item.unitPrice)}</td><td align="right">{pkr(item.subtotal)}</td></tr>)}
      </tbody></table>
      <div className="print-row"><span>Total Amount</span><span>{pkr(order?.totalAmount || 0)}</span></div>
      <div className="print-row"><span>Advance Paid</span><span>{pkr(order?.advancePaid || 0)}</span></div>
      <div className="print-row"><span>Due Amount</span><span>{pkr(order?.dueAmount || 0)}</span></div>
      {order?.notes && <div>Notes: {order.notes}</div>}
      <div className="print-line" />
      <PrintBrandFooter />
    </div>
  );
}
