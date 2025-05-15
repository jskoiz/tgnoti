import React, { useState, useEffect } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { useDashboard } from '../../context/DashboardContext.js';
import { TopicConfigData } from '../../services/api.js';
import './Config.css';

/**
 * Topic configuration page component using React Hook Form
 */
const TopicConfigPage: React.FC = () => {
  const { 
    topicConfig, 
    configLoading, 
    configError, 
    configSaving, 
    updateTopicConfig 
  } = useDashboard();
  
  const [topics, setTopics] = useState<string[]>([]);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);

  // Initialize React Hook Form
  const { control, handleSubmit, reset, watch } = useForm<TopicConfigData>({
    defaultValues: topicConfig || {}
  });

  // Get the current form values
  const formValues = watch();

  // Update state when topic config changes
  useEffect(() => {
    if (topicConfig) {
      reset(topicConfig);
      const topicNames = Object.keys(topicConfig);
      setTopics(topicNames);
      
      if (topicNames.length > 0 && !activeTopic) {
        setActiveTopic(topicNames[0]);
      }
    }
  }, [topicConfig, activeTopic, reset]);

  // Set up field array for filters if there's an active topic
  const { fields, append, remove } = useFieldArray({
    control,
    name: activeTopic ? `${activeTopic}.filters` : 'placeholder.filters',
    keyName: 'id'
  });

  if (configLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading topic configuration...</p>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="error-container">
        <h2>Error Loading Topic Configuration</h2>
        <p>{configError.message}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!topicConfig || topics.length === 0) {
    return (
      <div className="empty-container">
        <h2>No Topics Available</h2>
        <p>There are no topics configured at this time.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    );
  }

  const handleTopicSelect = (topic: string) => {
    setActiveTopic(topic);
    // Reset status messages
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleAddFilter = () => {
    if (!activeTopic) return;
    append({ type: 'keyword', value: '' });
    
    // Reset status messages
    setSaveSuccess(false);
    setSaveError(null);
  };

  const onSubmit = async (data: TopicConfigData) => {
    setSaveSuccess(false);
    setSaveError(null);

    try {
      await updateTopicConfig(data);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  return (
    <div className="config-page">
      <div className="page-header">
        <h2>Topic Configuration</h2>
      </div>

      <div className="config-container">
        <div className="row">
          <div className="col-4">
            <div className="card">
              <div className="card-header">Topics</div>
              <div className="card-body">
                <div className="topic-list">
                  {topics.map((topic) => (
                    <div
                      key={topic}
                      className={`topic-item ${topic === activeTopic ? 'active' : ''}`}
                      onClick={() => handleTopicSelect(topic)}
                    >
                      <div className="topic-name">{topic}</div>
                      <div className={`topic-status ${
                        formValues[topic]?.notification?.enabled ? 'enabled' : 'disabled'
                      }`}>
                        {formValues[topic]?.notification?.enabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="col-8">
            {activeTopic && (
              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="card">
                  <div className="card-header">
                    Configure Topic: {activeTopic}
                  </div>
                  <div className="card-body">
                    <div className="topic-editor">
                      <div className="form-group">
                        <label>
                          <Controller
                            name={`${activeTopic}.notification.enabled`}
                            control={control}
                            render={({ field }) => (
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                              />
                            )}
                          />
                          <span>Enable Notifications</span>
                        </label>
                      </div>

                      <h4>Filters</h4>
                      <div className="filter-list">
                        {fields.map((field, index) => (
                          <div key={field.id} className="filter-item">
                            <Controller
                              name={`${activeTopic}.filters.${index}.type`}
                              control={control}
                              render={({ field }) => (
                                <select
                                  className="form-control filter-type"
                                  value={field.value}
                                  onChange={field.onChange}
                                >
                                  <option value="keyword">Keyword</option>
                                  <option value="hashtag">Hashtag</option>
                                  <option value="username">Username</option>
                                  <option value="exclude">Exclude</option>
                                </select>
                              )}
                            />
                            <Controller
                              name={`${activeTopic}.filters.${index}.value`}
                              control={control}
                              rules={{ required: 'Filter value is required' }}
                              render={({ field, fieldState }) => (
                                <>
                                  <input
                                    type="text"
                                    className={`form-control filter-value ${fieldState.error ? 'is-invalid' : ''}`}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="Filter value"
                                  />
                                  {fieldState.error && (
                                    <div className="invalid-feedback">
                                      {fieldState.error.message}
                                    </div>
                                  )}
                                </>
                              )}
                            />
                            <div className="filter-actions">
                              <button
                                type="button"
                                className="btn-icon"
                                onClick={() => remove(index)}
                                title="Remove filter"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary add-filter-btn"
                        onClick={handleAddFilter}
                      >
                        Add Filter
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={configSaving}>
                    {configSaving ? 'Saving...' : 'Save Topic Configuration'}
                  </button>
                </div>

                {/* Status Messages */}
                {saveSuccess && (
                  <div className="alert alert-success">
                    Topic configuration saved successfully!
                  </div>
                )}

                {saveError && (
                  <div className="alert alert-danger">
                    Error saving topic configuration: {saveError.message}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopicConfigPage;