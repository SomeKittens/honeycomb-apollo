import { ResponsePath } from 'graphql';

const responsePathArray = (rp: ResponsePath): (string | number)[] => {
  const path = [rp.key];
  while (rp.prev) {
    rp = rp.prev;
    path.unshift(rp.key);
  }
  return path;
};

export const responsePathAsString = (rp: ResponsePath) => {
  return responsePathArray(rp).join('.');
};
export const parentResponsePathAsString = (rp: ResponsePath): string => {
  return responsePathArray(rp).slice(0, -1).join('.');
};
export const parentResponsePathAsNumberlessString = (rp) => {
  const rpa = responsePathArray(rp).slice(0, -1);
  if (typeof rpa[rpa.length - 1] === 'number') {
    return rpa.slice(0, -1).join('.');
  }
  return rpa.join('.');
};
