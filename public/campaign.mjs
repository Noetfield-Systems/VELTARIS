const keys = ['utm_source','utm_medium','utm_campaign','utm_content'];

export function campaignTags(url) {
  const query = new URL(url).searchParams;
  return Object.fromEntries(keys.flatMap((key) => {
    const value = query.get(key);
    return value && /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(value) ? [[key,value]] : [];
  }));
}

export function carryCampaign() {
  const tags = campaignTags(location.href);
  if (!Object.keys(tags).length) return;
  for (const link of document.querySelectorAll('a[href="/workspace.html"], a[href="/#pilot"]')) {
    const target = new URL(link.href);
    if (target.hash === '#pilot') target.pathname = '/private-credit.html';
    for (const [key,value] of Object.entries(tags)) target.searchParams.set(key,value);
    link.href = target.href;
  }
}
