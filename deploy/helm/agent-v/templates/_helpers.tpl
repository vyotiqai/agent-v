{{- define "agent-v.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "agent-v.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "agent-v.selector" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "agent-v.secretName" -}}
{{- default (printf "%s-secrets" (include "agent-v.fullname" .)) .Values.existingSecret -}}
{{- end -}}

{{- define "agent-v.host" -}}
{{- .Values.publicUrl | trimPrefix "https://" | trimPrefix "http://" | trimSuffix "/" -}}
{{- end -}}

{{- define "agent-v.databaseUrl" -}}
{{- printf "postgresql://agentv:%s@%s-postgresql:5432/agentv" .Values.postgresql.password (include "agent-v.fullname" .) -}}
{{- end -}}
