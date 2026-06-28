'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Activity, MapPin } from 'lucide-react';
import { apiPath } from '../lib/api-client';

// Theme Colors
const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444'];

export default function PlatformAnalytics({ strains }: { strains: any[] }) {
  const [gcData, setGcData] = useState([]);

  // Fetch the GC Distribution from the backend
  useEffect(() => {
    fetch(apiPath('/stats/gc-distribution'))
      .then(res => res.json())
      .then(data => setGcData(data))
      .catch(console.error);
  }, []);

  // Automatically calculate Strains by City for the Pie Chart
  const locationData = useMemo(() => {
    if (!strains || strains.length === 0) return [];
    
    const counts: Record<string, number> = {};
    strains.forEach(s => {
      const city = s.city || 'Unknown';
      counts[city] = (counts[city] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5 locations
  }, [strains]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
      
      {/* Chart 1: GC Content Distribution */}
      <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-lg transition-shadow">
        <h3 className="text-xl font-black text-[#0B1B3A] mb-6 flex items-center gap-3 tracking-tighter">
          <Activity size={22} className="text-orange-500" /> Genomic GC Distribution
        </h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gcData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="value" fill="#0B1B3A" radius={[8, 8, 0, 0]} barSize={40}>
                 {gcData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 1 ? '#f97316' : '#0B1B3A'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Isolates by Location */}
      <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-lg transition-shadow">
        <h3 className="text-xl font-black text-[#0B1B3A] mb-6 flex items-center gap-3 tracking-tighter">
          <MapPin size={22} className="text-blue-500" /> Isolates by Region
        </h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={locationData}
                cx="50%"
                cy="45%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {locationData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 900 }}
                itemStyle={{ color: '#0B1B3A' }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle"
                wrapperStyle={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
