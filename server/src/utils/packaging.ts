export const calculatePackagingCharge = (
  packagingType: { chargeType: string; extraCharge: number },
  quantity: number,
  itemSubtotal: number
) => {
  switch (packagingType.chargeType) {
    case 'FIXED': return Number(packagingType.extraCharge || 0);
    case 'PER_KG': return Number(packagingType.extraCharge || 0) * quantity;
    case 'PERCENTAGE': return (Number(packagingType.extraCharge || 0) / 100) * itemSubtotal;
    default: return 0;
  }
};
