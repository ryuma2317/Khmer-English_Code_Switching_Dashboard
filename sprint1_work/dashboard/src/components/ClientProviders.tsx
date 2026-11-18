'use client';

import React from 'react';
import { DatasetProvider } from '../context/DatasetContext';
import SaveFeedbackBanner from './SaveFeedbackBanner';
import HydrationLoader from './HydrationLoader';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <DatasetProvider>
      <HydrationLoader />
      {children}
      <SaveFeedbackBanner />
    </DatasetProvider>
  );
}
