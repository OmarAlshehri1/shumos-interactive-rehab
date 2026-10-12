export function InteractionIcon({name}:{name:string}){
 const paths:Record<string,string>={hand:'M8 13V6a2 2 0 0 1 4 0v6V4a2 2 0 0 1 4 0v9V7a2 2 0 0 1 4 0v8l-1 7H10l-6-8a2 2 0 0 1 3-2l3 3',foot:'M14 3c5 0 5 6 2 9l-2 2 1 5c1 4-6 5-7 1l-2-6 3-7c1-2 2-4 5-4Z',controller:'M7 8h10c4 0 6 11 3 12-2 1-4-3-5-4H9c-1 1-3 5-5 4C1 19 3 8 7 8ZM8 10v5m-2-2h4m6-2h.01m3 3h.01',wheel:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM4 11h16M12 12v9M9 11a3 3 0 0 1 6 0',wall:'M4 3h16v14H4V3Zm3 18h10m-5-4v4M7 7h10m-7 4h4',floor:'M3 15l9-5 9 5-9 6-9-6Zm9-12v5m-3-3 3 3 3-3'};
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]??paths.hand}/></svg>;
}
