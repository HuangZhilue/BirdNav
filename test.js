const cachedObservations = [
  { speciesCode: 'a', obsDt: '2026-08-01 10:00' }, // today
  { speciesCode: 'b', obsDt: '2026-07-20 10:00' }, // 12 days ago
  { speciesCode: 'c', obsDt: '2026-07-01 10:00' }  // 31 days ago
];

function filterDays(days) {
  let list = cachedObservations;
  if (days !== null) {
    list = list.filter(o => {
      const obsDate = new Date(o.obsDt.replace(' ', 'T'));
      const diffDays = (Date.now() - obsDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= days;
    });
  }
  return list.length;
}

console.log("7 days:", filterDays(7));
console.log("14 days:", filterDays(14));
console.log("30 days:", filterDays(30));
console.log("All:", filterDays(null));
