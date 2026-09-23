"use client";
import {useEffect,useState} from 'react';
import {useTheme} from 'next-themes';
import {Moon,Sun} from 'lucide-react';
import {Switch} from '@/components/ui/switch';

export function ThemeToggle(){
 const {theme,setTheme}=useTheme();
 const [mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 const dark=mounted&&theme==='dark';
 return <label className="theme-toggle">
  {dark?<Moon size={15}/>:<Sun size={15}/>}
  <Switch checked={dark} onCheckedChange={v=>setTheme(v?'dark':'light')} aria-label="Modo escuro"/>
 </label>;
}
