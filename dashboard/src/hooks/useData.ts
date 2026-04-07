import { useContext } from 'react';
import { DataContext } from '../context/data-context';

export function useData() {
  return useContext(DataContext);
}
