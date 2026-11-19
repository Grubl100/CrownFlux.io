import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="page-container">
      <div className="panel" style={{ maxWidth: 520, margin: '32px auto', textAlign: 'center' }}>
        <span className="eyebrow">Erro 404</span>
        <h1>Página não encontrada</h1>
        <p className="muted" style={{ margin: '10px 0 20px' }}>
          O endereço acessado não existe ou foi movido. Retorne para a Central de Modos do Crownflux.io.
        </p>
        <button type="button" className="primary" onClick={() => navigate('/modes')}>
          Ir para Central de Modos
        </button>
      </div>
    </div>
  );
}
