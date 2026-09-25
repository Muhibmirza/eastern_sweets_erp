export const canEditDelete = (role?: string) => role === 'ADMIN' || role === 'MANAGER';
