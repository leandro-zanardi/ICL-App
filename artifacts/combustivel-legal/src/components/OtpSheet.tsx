import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnviarOtp, useVerificarOtp } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

export function OtpSheet({ isOpen, onOpenChange, onSuccess }: { isOpen: boolean, onOpenChange: (open: boolean) => void, onSuccess?: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
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
      setContato('');
      setCodigo('');
      setHelperText('');
    }
  }, [isOpen]);

  const handleEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (contato.length < 5) return;
    
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
            {step === 1 ? 'Use seu celular para acessar sua carteira de benefícios.' : 'Digite o código que enviamos para você.'}
          </SheetDescription>
        </SheetHeader>

        {step === 1 ? (
          <form onSubmit={handleEnviar} className="flex flex-col gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Celular</label>
              <Input
                type="text"
                placeholder="(11) 99999-9999"
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                disabled={enviarOtp.isPending}
                className="h-12 text-lg"
                autoFocus
              />
            </div>
            <Button type="submit" size="lg" className="w-full text-md font-bold bg-primary hover:bg-primary/90" disabled={enviarOtp.isPending || contato.length < 5}>
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