'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDataset } from '../context/DatasetContext';
import { Upload, LayoutDashboard, Users, FileText, Database, Trash2 } from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();
  const { tasks, loadSyntheticSample, clearData } = useDataset();

  const navItems = [
    { label: 'Overview', href: '/', icon: LayoutDashboard },
    { label: 'Import Export', href: '/import', icon: Upload },
    { label: 'Member Progress', href: '/members', icon: Users },
    { label: 'Recording List', href: '/recordings', icon: FileText },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <div className="bg-indigo-600 text-white p-2 rounded-lg font-bold text-lg shadow-sm">
                CS
              </div>
              <div>
                <span className="font-bold text-slate-900 text-lg tracking-tight block">
                  Khmer-English Speech
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  Dataset Progress Dashboard • Project 42
                </span>
              </div>
            </div>

            <nav className="hidden md:flex space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              <Database className="w-3.5 h-3.5 mr-1 text-slate-500" />
              {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} loaded
            </span>

            {tasks.length === 0 ? (
              <button
                onClick={loadSyntheticSample}
                className="inline-flex items-center px-3 py-1.5 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 text-xs font-semibold rounded-md shadow-sm transition"
              >
                Load Demo Sample
              </button>
            ) : (
              <button
                onClick={clearData}
                title="Reset local storage"
                className="inline-flex items-center px-2 py-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-xs font-medium rounded-md transition"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
