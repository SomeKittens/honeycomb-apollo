import { ResponsePath } from 'graphql';

const responsePathArray = (rp: ResponsePath): (string | number)[] => {
  const path = [rp.key];
  while (rp.prev) {
    rp = rp.prev;
    // Ignore numerical entries (i.e. GQL is iterating over an array)
    // That way we get a single entry like `getPagerdutyLogEntries.service.summary`
    // Instead of `getPagerdutyLogEntries.0.service.summary`, `getPagerdutyLogEntries.1.service.summary`, etc
    // if (skipNums) {
    //   if (typeof rp.key === 'string') {
    //     path.unshift(rp.key);
    //   }
    // } else {
      path.unshift(rp.key);
    // }
  }
  return path;
};

export const responsePathAsString = (rp: ResponsePath) => {
  return responsePathArray(rp).join('.');
};
export const parentResponsePathAsString = (rp) => {
  return responsePathArray(rp).slice(0, -1).join('.');
};
export const parentResponsePathAsNumberlessString = (rp) => {
  console.log('look ma I was called');

  const rpa = responsePathArray(rp).slice(0, -1);
  if (typeof rpa[rpa.length - 1] === 'number') {
    return rpa.slice(0, -1).join('.');
  }
  return rpa.join('.');
};
