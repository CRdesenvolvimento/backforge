import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureGrowthEvent } from '../../lib/growth';

export function PageTracker() {
  const location = useLocation();

  useEffect(() => {
    void captureGrowthEvent('page_view', {
      path: `${location.pathname}${location.search}`,
    });
  }, [location.pathname, location.search]);

  return null;
}
