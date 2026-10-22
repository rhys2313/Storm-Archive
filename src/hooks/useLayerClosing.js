import { createContext, useContext } from 'react';
export const LayerClosingContext = createContext(false);
export const useLayerClosing = () => useContext(LayerClosingContext);
