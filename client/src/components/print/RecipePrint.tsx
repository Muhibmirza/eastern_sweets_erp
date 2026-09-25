import dayjs from 'dayjs';
import { EASTERN_SWEETS_LOGO_BASE64 } from '../../constants/logo';
import { formatQuantity, pkr } from '../../utils/format';
import { PrintBrandFooter } from './PrintBrandFooter';

export function RecipePrint({ recipe, cost }: { recipe: any; cost?: any }) {
  const rawMaterialCost = cost?.rawMaterialCost || cost?.totalRawMaterialCost || 0;
  const labourCost = recipe?.labourCost || recipe?.laborCost || cost?.labourCost || cost?.laborCost || 0;
  const packagingCost = recipe?.packagingCost || recipe?.packingCost || cost?.packagingCost || cost?.packingCost || 0;
  const wastageCost = cost?.wastageCost || rawMaterialCost * ((recipe?.wastagePercent || 0) / 100);
  const totalCostPerUnit = cost?.totalCostPerUnit || cost?.costPerUnit || 0;
  return (
    <div className="thermal-print">
      <div className="print-center"><img src={EASTERN_SWEETS_LOGO_BASE64} alt="Eastern Sweets" style={{ width: 64, height: 64, objectFit: 'contain' }} /><h2>RECIPE COST SHEET</h2></div>
      <div className="print-line" />
      <div>Recipe Name: {recipe?.name}</div>
      <div>Date Created: {dayjs(recipe?.createdAt).format('DD-MMM-YYYY')}</div>
      <div>Yield: {formatQuantity(recipe?.yieldQuantity || 0, recipe?.yieldUnit || '')}</div>
      <div className="print-line" />
      <h3>RAW MATERIALS REQUIRED</h3>
      <table><thead><tr><th align="left">Material</th><th>Qty</th><th>Unit</th></tr></thead><tbody>
        {(recipe?.ingredients || []).map((item: any) => <tr key={item.id}><td>{item.rawMaterial?.name}</td><td align="center">{item.quantity}</td><td align="center">{item.unit}</td></tr>)}
      </tbody></table>
      <div className="print-line" />
      <h3>OVERHEADS</h3>
      <div className="print-row"><span>Raw Material Cost</span><span>{pkr(rawMaterialCost)}</span></div>
      <div className="print-row"><span>Labour Cost</span><span>{pkr(labourCost)}</span></div>
      <div className="print-row"><span>Packaging</span><span>{pkr(packagingCost)}</span></div>
      <div className="print-row"><span>Other</span><span>{pkr(recipe?.otherOverheads || 0)}</span></div>
      <div className="print-row"><span>Wastage ({recipe?.wastagePercent || 0}%)</span><span>{pkr(wastageCost)}</span></div>
      <div className="print-row print-total"><span>TOTAL COST / {recipe?.yieldUnit || 'UNIT'}</span><span>{pkr(totalCostPerUnit)}</span></div>
      <div className="print-center">(Selling price set separately)</div>
      {recipe?.notes && <p>Notes: {recipe.notes}</p>}
      <div className="print-line" />
      <PrintBrandFooter />
    </div>
  );
}
