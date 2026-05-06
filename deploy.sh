#!/usr/bin/env bash
#
# deploy.sh — Deploy do glpi-dashboard para EC2 t3.small (low RAM)
#
# Estratégia: build local + tar+scp + npm install --omit=dev + pm2 restart.
# Não builda no servidor (RAM insuficiente). Mantém .next.bak para rollback.
#
# Uso:
#   ./deploy.sh              # deploy normal
#   ./deploy.sh --validate   # também roda curl no endpoint após deploy
#   ./deploy.sh --no-pull    # pula git pull (usa código que já está no servidor)
#
# Variáveis de ambiente (com defaults):
#   EC2_USER     ec2-user
#   EC2_HOST     dash.mundodosferros.com.br
#   SSH_KEY      ~/Documents/Trabalho/ssh/awsmundodosferros.pem
#   REMOTE_DIR   /home/ec2-user/glpi-dashboard
#   APP_NAME     glpi-dashboard
#   CRON_SECRET  (necessário só se passar --validate)
#
# Pré-requisitos locais: git, npm, tar, ssh, scp, curl

set -euo pipefail

# ────────────────────────────────────────────────────────────
# Config
# ────────────────────────────────────────────────────────────
EC2_USER="${EC2_USER:-ec2-user}"
EC2_HOST="${EC2_HOST:-dash.mundodosferros.com.br}"
SSH_KEY="${SSH_KEY:-$HOME/Documents/Trabalho/ssh/awsmundodosferros.pem}"
REMOTE_DIR="${REMOTE_DIR:-/home/ec2-user/glpi-dashboard}"
APP_NAME="${APP_NAME:-glpi-dashboard}"

# ────────────────────────────────────────────────────────────
# Args
# ────────────────────────────────────────────────────────────
VALIDATE=0
DO_PULL=1
for arg in "$@"; do
    case "$arg" in
        --validate)  VALIDATE=1 ;;
        --no-pull)   DO_PULL=0 ;;
        -h|--help)
            sed -n '2,20p' "$0"
            exit 0
            ;;
        *)
            echo "Argumento desconhecido: $arg" >&2
            exit 2
            ;;
    esac
done

# ────────────────────────────────────────────────────────────
# Helpers de output
# ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    C_RST=$'\033[0m' C_BLUE=$'\033[1;36m' C_GREEN=$'\033[1;32m' C_YELLOW=$'\033[1;33m' C_RED=$'\033[1;31m'
else
    C_RST="" C_BLUE="" C_GREEN="" C_YELLOW="" C_RED=""
fi
log()  { echo "${C_BLUE}▸${C_RST} $*"; }
ok()   { echo "${C_GREEN}✓${C_RST} $*"; }
warn() { echo "${C_YELLOW}!${C_RST} $*"; }
err()  { echo "${C_RED}✗${C_RST} $*" >&2; }

ssh_exec() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${EC2_USER}@${EC2_HOST}" "$@"
}

# ────────────────────────────────────────────────────────────
# Pré-flight
# ────────────────────────────────────────────────────────────
log "Pré-flight checks"

[[ -f "$SSH_KEY" ]] || { err "Chave SSH não encontrada: $SSH_KEY"; exit 1; }
[[ -f package.json ]] || { err "package.json não encontrado — rode do diretório raiz do projeto"; exit 1; }
command -v tar >/dev/null  || { err "tar não está instalado"; exit 1; }
command -v scp >/dev/null  || { err "scp não está instalado"; exit 1; }
command -v ssh >/dev/null  || { err "ssh não está instalado"; exit 1; }

# Aviso se há mudanças não commitadas (não bloqueia, mas avisa)
if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "Há mudanças não commitadas no repositório. O deploy usa o código LOCAL para build, mas o servidor faz git pull do remote."
    warn "Recomendado: commitar e push antes do deploy."
fi

# Testa SSH
log "Testando SSH para ${EC2_USER}@${EC2_HOST}"
if ! ssh_exec "echo connected" >/dev/null 2>&1; then
    err "Falha no SSH. Verifique SSH_KEY=$SSH_KEY e EC2_HOST=$EC2_HOST"
    exit 1
fi
ok "SSH OK"

# ────────────────────────────────────────────────────────────
# Build local
# ────────────────────────────────────────────────────────────
log "Build local (npm run build)"
START=$(date +%s)
npm run build > /tmp/deploy-build.log 2>&1 || {
    err "Build falhou — veja /tmp/deploy-build.log"
    tail -30 /tmp/deploy-build.log >&2
    exit 1
}
ok "Build OK em $(($(date +%s) - START))s"

[[ -f .next/BUILD_ID ]] || { err ".next/BUILD_ID não encontrado após build"; exit 1; }
BUILD_ID=$(cat .next/BUILD_ID)
log "BUILD_ID = $BUILD_ID"

# ────────────────────────────────────────────────────────────
# Compacta .next (exclui dev/cache/trace para minimizar tamanho)
# ────────────────────────────────────────────────────────────
log "Compactando .next/ (sem dev/cache/trace)"
TARFILE=$(mktemp -t next-build.XXXXXX)
mv "$TARFILE" "${TARFILE}.tar.gz"
TARFILE="${TARFILE}.tar.gz"

tar --exclude='.next/cache' \
    --exclude='.next/dev' \
    --exclude='.next/trace' \
    -czf "$TARFILE" .next

SIZE=$(du -h "$TARFILE" | cut -f1)
ok "Empacotado: $TARFILE ($SIZE)"

# Cleanup do tar mesmo em caso de erro
trap 'rm -f "$TARFILE"' EXIT

# ────────────────────────────────────────────────────────────
# Transfere para EC2
# ────────────────────────────────────────────────────────────
log "Transferindo build para EC2..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -q \
    "$TARFILE" "${EC2_USER}@${EC2_HOST}:/home/${EC2_USER}/next-build.tar.gz"
ok "Transfer OK"

# ────────────────────────────────────────────────────────────
# Deploy remoto
# ────────────────────────────────────────────────────────────
log "Atualizando servidor"

# Passa as flags como variáveis de ambiente para o script remoto
ssh_exec "DO_PULL=$DO_PULL REMOTE_DIR=$REMOTE_DIR APP_NAME=$APP_NAME bash -s" << 'REMOTE_EOF'
set -euo pipefail

cd "$REMOTE_DIR"

# Garante ownership (deploys antigos podem ter deixado arquivos como root)
sudo chown -R ec2-user:ec2-user .

if [[ "$DO_PULL" == "1" ]]; then
    echo "▸ git pull origin main"
    # reset --hard para evitar conflitos com node_modules-derived diffs (package-lock.json, etc)
    git fetch origin main --quiet
    git reset --hard origin/main --quiet
    echo "  → $(git log --oneline -1)"
fi

echo "▸ npm install --omit=dev (cap 1GB heap)"
NODE_OPTIONS='--max-old-space-size=1024' \
    npm install --omit=dev --no-audit --no-fund --no-progress 2>&1 | tail -3

echo "▸ Substituindo .next/ (mantém .next.bak para rollback)"
rm -rf .next.bak
[[ -d .next ]] && mv .next .next.bak
tar -xzf /home/ec2-user/next-build.tar.gz
rm -f /home/ec2-user/next-build.tar.gz

if [[ -f .next/BUILD_ID ]]; then
    echo "  → BUILD_ID=$(cat .next/BUILD_ID)"
fi

echo "▸ pm2 restart $APP_NAME"
pm2 restart "$APP_NAME" --update-env --silent

echo "▸ Health check (até 60s)"
for i in $(seq 1 12); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:3000 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then
        echo "  → HTTP 200 (ok)"
        break
    fi
    sleep 5
    if [[ $i -eq 12 ]]; then
        echo "  → APP NÃO RESPONDEU após 60s. Veja: pm2 logs $APP_NAME"
        exit 1
    fi
done

echo "▸ Status final"
pm2 list | grep -E "name|$APP_NAME"
REMOTE_EOF

ok "Deploy concluído"

# ────────────────────────────────────────────────────────────
# Validação opcional
# ────────────────────────────────────────────────────────────
if [[ "$VALIDATE" == "1" ]]; then
    if [[ -z "${CRON_SECRET:-}" ]]; then
        warn "--validate passado mas CRON_SECRET não está no env. Pulando."
    else
        log "Validando endpoint /api/cron/weekly-report"
        echo ""
        curl -sS -w "\n${C_BLUE}HTTP %{http_code} | %{time_total}s${C_RST}\n" \
            --max-time 240 \
            -H "Authorization: Bearer $CRON_SECRET" \
            "https://${EC2_HOST}/api/cron/weekly-report"
        echo ""
    fi
fi

# ────────────────────────────────────────────────────────────
# Footer
# ────────────────────────────────────────────────────────────
echo ""
ok "Tudo pronto. App atualizada em https://${EC2_HOST}"
echo ""
echo "Rollback rápido (se necessário):"
echo "  ssh -i \"$SSH_KEY\" ${EC2_USER}@${EC2_HOST} \\"
echo "    'cd $REMOTE_DIR && rm -rf .next && mv .next.bak .next && pm2 restart $APP_NAME'"
