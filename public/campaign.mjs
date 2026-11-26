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

export function recordCampaign(event) {
  const tags = campaignTags(location.href);
  const variant = tags.utm_content?.toLowerCase();
  const paid = (variant === 'control-landscape' || variant === 'journal-square') && tags.utm_medium?.toLowerCase() === 'paid-social';
  const organic = variant === 'founder-post' && tags.utm_medium?.toLowerCase() === 'organic-social';
  if ((!paid && !organic) || tags.utm_source?.toLowerCase() !== 'linkedin' || tags.utm_campaign?.toLowerCase() !== 'private-credit-launch') return;
  const body = JSON.stringify({variant,event});
  const beacon = new Blob([body],{type:'application/json'});
  if (!navigator.sendBeacon?.('/api/campaign',beacon)) {
    fetch('/api/campaign',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(() => {});
  }
}
