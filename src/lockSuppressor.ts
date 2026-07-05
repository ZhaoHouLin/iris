let _suppress = false;
export const getSuppressLock = () => _suppress;
export const setSuppressLock = (v: boolean) => { _suppress = v; };
