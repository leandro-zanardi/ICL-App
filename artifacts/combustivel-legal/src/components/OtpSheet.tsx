import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnviarOtp, useVerificarOtp } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

type ContactMode = 'phone' | 'email';

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidPhone(value: string) {
  return /^\([1-9]\d\) 9\d{4}-\d{4}$/.test(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function OtpSheet({ isOpen, onOpenChange, onSuccess }: { isOpen: boolean, onOpenChange: (open: boolean) => void, onSuccess?: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [contactMode, setContactMode] = useState<ContactMode>('phone');
  const [contato, setContato] = useState('');
  const [codigo, setCodigo] = useState('');
  const [helperText, setHelperText] = useState('');
  
  const enviarOtp = useEnviarOtp();
  const verificarOtp = useVerificarOtp();
  const { setToken } = useAuth();
  const queryClient = useQueryClient();

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setContactMode('phone');
      setContato('');
      setCodigo('');
      setHelperText('');
    }
  }, [isOpen]);

  const handleEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidContact) return;
    
    enviarOtp.mutate({ data: { contato } }, {
      onSuccess: (data) => {
        setHelperText(data.mensagem); // reveals demo code 1234
        setStep(2);
      },
      onError: (err: any) => {
        toast({ title: 'Erro ao enviar OTP', description: err.message || 'Tente novamente.', variant: 'destructive' });
      }
    });
  };

  const isValidContact = contactMode === 'phone' ? isValidPhone(contato) : isValidEmail(contato);

  const handleVerificar = (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo.length < 4) return;

    verificarOtp.mutate({ data: { contato, codigo } }, {
      onSuccess: (data) => {
        setToken(data.token);
        queryClient.invalidateQueries(); // invalidate all (carteira, resgates)
        if (onSuccess) onSuccess();
        else onOpenChange(false);
      },
      onError: (err: any) => {
        toast({ title: 'Código inválido', description: err.message || 'Verifique o código e tente novamente.', variant: 'destructive' });
      }
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl sm:max-w-md sm:mx-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-2xl font-display text-primary">
            {step === 1 ? 'Entrar' : 'Confirmar Código'}
          </SheetTitle>
          <SheetDescription>
            {step === 1 ? 'Use seu celular ou e-mail para acessar sua carteira de benefícios.' : 'Digite o código que enviamos para você.'}
          </SheetDescription>
        </SheetHeader>

        {step === 1 ? (
          <form onSubmit={handleEnviar} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Tipo de contato">
              <button
                type="button"
                aria-pressed={contactMode === 'phone'}
                onClick={() => {
                  setContactMode('phone');
                  setContato('');
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${contactMode === 'phone' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
              >
                Celular
              </button>
              <button
                type="button"
                aria-pressed={contactMode === 'email'}
                onClick={() => {
                  setContactMode('email');
                  setContato('');
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${contactMode === 'email' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
              >
                E-mail
              </button>
            </div>
            <div className="space-y-2">
              <label htmlFor="otp-contact" className="text-sm font-medium text-slate-700">
                {contactMode === 'phone' ? 'Celular' : 'E-mail'}
              </label>
              <Input
                id="otp-contact"
                type="text"
                inputMode={contactMode === 'phone' ? 'tel' : 'email'}
                placeholder={contactMode === 'phone' ? '(11) 99999-9999' : 'voce@exemplo.com'}
                value={contato}
                onChange={(e) => setContato(contactMode === 'phone' ? formatPhone(e.target.value) : e.target.value)}
                disabled={enviarOtp.isPending}
                className="h-12 text-lg"
                autoFocus
              />
              {contato.length > 0 && !isValidContact && (
                <p className="text-xs text-red-600">
                  {contactMode === 'phone' ? 'Informe um DDD e um celular com 9 dígitos.' : 'Informe um e-mail válido.'}
                </p>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full text-md font-bold bg-primary hover:bg-primary/90" disabled={enviarOtp.isPending || !isValidContact}>
              {enviarOtp.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continuar'}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-slate-500" onClick={() => onOpenChange(false)}>
              Entrar depois
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerificar} className="flex flex-col gap-4">
             <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Código OTP</label>
              <Input
                type="text"
                placeholder="1234"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                disabled={verificarOtp.isPending}
                className="h-12 text-lg text-center tracking-widest font-mono"
                maxLength={6}
                autoFocus
              />
              {helperText && <p className="text-sm text-amber-600 font-medium">{helperText}</p>}
            </div>
            <Button type="submit" size="lg" className="w-full text-md font-bold bg-primary hover:bg-primary/90" disabled={verificarOtp.isPending || codigo.length < 4}>
              {verificarOtp.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-slate-500" onClick={() => setStep(1)}>
              Voltar
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}