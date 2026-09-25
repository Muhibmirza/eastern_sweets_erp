import dayjs from 'dayjs';
import { EASTERN_SWEETS_LOGO_BASE64 } from '../../constants/logo';
import { formatQuantity, pkr } from '../../utils/format';
import { PrintBrandFooter } from './PrintBrandFooter';

export function ProductionSlip({ order }: { order: any }) {
  return (
    <div className="thermal-print">
      <div className="print-center">
        <img src={EASTERN_SWEETS_LOGO_BASE64} alt="Eastern Sweets" style={{ width: 64, height: 64, objectFit: 'contain' }} />
        <div>Eastern Sweets, Bakers &amp; Nimco</div>
        <h2>PRODUCTION ORDER</h2>
      </div>
      <div className="print-line" />
      <div>Production Order #: {order?.id}</div>
      <div className="print-row"><span>Date: {dayjs(order?.productionDate).format('DD-MMM-YYYY')}</span><span>Time: {dayjs(order?.createdAt || order?.productionDate).format('hh:mm A')}</span></div>
      <div>Recipe: {order?.recipe?.name}</div>
      <div>Status: {order?.status}</div>
      <div className="print-line" />
      <div className="print-row"><span>Planned Qty</span><span>{formatQuantity(order?.plannedQuantity || 0, order?.product?.unit || '')}</span></div>
      <div className="print-row"><span>Actual Qty</span><span>{formatQuantity(order?.actualQuantity || 0, order?.product?.unit || '')}</span></div>
      <h3>RAW MATERIALS CONSUMED</h3>
      <table><thead><tr><th align="left">Material</th><th>Planned</th><th>Actual</th></tr></thead><tbody>
        {(order?.consumptions || []).map((item: any) => <tr key={item.id}><td>{item.rawMaterial?.name}</td><td align="center">{formatQuantity(item.plannedQty, item.unit)}</td><td align="center">{formatQuantity(item.actualQty, item.unit)}</td></tr>)}
      </tbody></table>
      <div className="print-row"><span>Total Batch Cost</span><span>{pkr(order?.totalCost || 0)}</span></div>
      <div className="print-row"><span>Cost Per Unit</span><span>{pkr(order?.costPerUnit || 0)}</span></div>
      <div>Created By: {order?.creator?.name || '-'}</div>
      <div className="print-line" />
      <PrintBrandFooter />
    </div>
  );
}
