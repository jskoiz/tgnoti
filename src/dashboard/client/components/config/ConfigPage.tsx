import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useDashboard } from '../../context/DashboardContext.js';
import { ConfigData } from '../../services/api.js';
import './Config.css';

/**
 * Configuration page component using React Hook Form
 */
const ConfigPage: React.FC = () => {
  const { 
    config, 
    configLoading, 
    configError, 
    configSaving, 
    updateConfig 
  } = useDashboard();
  
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [saveError, setSaveError] = React.useState<Error | null>(null);

  // Initialize React Hook Form
  const { control, handleSubmit, reset } = useForm<ConfigData>({
    defaultValues: config || undefined
  });

  // Update form values when config changes
  React.useEffect(() => {
    if (config) {
      reset(config);
    }
  }, [config, reset]);

  if (configLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading configuration...</p>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="error-container">
        <h2>Error Loading Configuration</h2>
        <p>{configError.message}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="empty-container">
        <h2>No Configuration Available</h2>
        <p>There is no configuration data available at this time.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    );
  }

  const onSubmit = async (formData: ConfigData) => {
    setSaveSuccess(false);
    setSaveError(null);

    try {
      await updateConfig(formData);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  return (
    <div className="config-page">
      <div className="page-header">
        <h2>System Configuration</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="config-container">
          {/* Twitter Configuration */}
          <div className="card">
            <div className="card-header">Twitter Configuration</div>
            <div className="card-body">
              <div className="form-group">
                <label>
                  <Controller
                    name="twitter.enabled"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    )}
                  />
                  <span>Enable Twitter Service</span>
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="searchInterval">Search Interval (ms)</label>
                <Controller
                  name="twitter.searchInterval"
                  control={control}
                  rules={{ min: 1000 }}
                  render={({ field, fieldState }) => (
                    <>
                      <input
                        id="searchInterval"
                        type="number"
                        className={`form-control ${fieldState.error ? 'is-invalid' : ''}`}
                        value={field.value}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        min="1000"
                      />
                      {fieldState.error && (
                        <div className="invalid-feedback">
                          {fieldState.error.message || 'Minimum value is 1000ms'}
                        </div>
                      )}
                    </>
                  )}
                />
              </div>

              <div className="form-group">
                <label htmlFor="maxResults">Max Results Per Search</label>
                <Controller
                  name="twitter.maxResults"
                  control={control}
                  rules={{ min: 1, max: 100 }}
                  render={({ field, fieldState }) => (
                    <>
                      <input
                        id="maxResults"
                        type="number"
                        className={`form-control ${fieldState.error ? 'is-invalid' : ''}`}
                        value={field.value}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        min="1"
                        max="100"
                      />
                      {fieldState.error && (
                        <div className="invalid-feedback">
                          {fieldState.error.message || 'Value must be between 1 and 100'}
                        </div>
                      )}
                    </>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Telegram Configuration */}
          <div className="card">
            <div className="card-header">Telegram Configuration</div>
            <div className="card-body">
              <div className="form-group">
                <label>
                  <Controller
                    name="telegram.enabled"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    )}
                  />
                  <span>Enable Telegram Service</span>
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="chatId">Chat ID</label>
                <Controller
                  name="telegram.chatId"
                  control={control}
                  rules={{ required: 'Chat ID is required' }}
                  render={({ field, fieldState }) => (
                    <>
                      <input
                        id="chatId"
                        type="text"
                        className={`form-control ${fieldState.error ? 'is-invalid' : ''}`}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                      {fieldState.error && (
                        <div className="invalid-feedback">
                          {fieldState.error.message}
                        </div>
                      )}
                    </>
                  )}
                />
              </div>

              <div className="form-group">
                <label htmlFor="sendInterval">Send Interval (ms)</label>
                <Controller
                  name="telegram.sendInterval"
                  control={control}
                  rules={{ min: 1000 }}
                  render={({ field, fieldState }) => (
                    <>
                      <input
                        id="sendInterval"
                        type="number"
                        className={`form-control ${fieldState.error ? 'is-invalid' : ''}`}
                        value={field.value}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        min="1000"
                      />
                      {fieldState.error && (
                        <div className="invalid-feedback">
                          {fieldState.error.message || 'Minimum value is 1000ms'}
                        </div>
                      )}
                    </>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Monitoring Configuration */}
          <div className="card">
            <div className="card-header">Monitoring Configuration</div>
            <div className="card-body">
              <div className="form-group">
                <label htmlFor="metricsInterval">Metrics Interval (ms)</label>
                <Controller
                  name="monitoring.metricsInterval"
                  control={control}
                  rules={{ min: 1000 }}
                  render={({ field, fieldState }) => (
                    <>
                      <input
                        id="metricsInterval"
                        type="number"
                        className={`form-control ${fieldState.error ? 'is-invalid' : ''}`}
                        value={field.value}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        min="1000"
                      />
                      {fieldState.error && (
                        <div className="invalid-feedback">
                          {fieldState.error.message || 'Minimum value is 1000ms'}
                        </div>
                      )}
                    </>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={configSaving}>
              {configSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>

          {/* Status Messages */}
          {saveSuccess && (
            <div className="alert alert-success">
              Configuration saved successfully!
            </div>
          )}

          {saveError && (
            <div className="alert alert-danger">
              Error saving configuration: {saveError.message}
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default ConfigPage;